/**
 * Bull queue workers.
 *
 * Queues decouple fast webhook ingress from slower operations:
 *  - inbound_message  → interview orchestrator
 *  - ats_event        → ATS status sync handler
 *  - session_timeout  → mark sessions as TIMEOUT after expiry
 */

import Bull from 'bull';
import { logger } from '../logger';
import { processInboundMessage, InboundMessage } from '../interview/orchestrator';
import { handleAtsEvent } from '../ats/handler';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// ── Queue definitions ─────────────────────────────────────────────────────────

export const inboundMessageQueue = new Bull<InboundMessageJob>('inbound_messages', REDIS_URL, {
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
});

export const atsEventQueue = new Bull<AtsEventJob>('ats_events', REDIS_URL, {
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
});

export const sessionTimeoutQueue = new Bull<SessionTimeoutJob>('session_timeouts', REDIS_URL);

// ── Job types ─────────────────────────────────────────────────────────────────

interface InboundMessageJob {
  channel: 'SMS' | 'EMAIL';
  from: string;
  body: string;
  webhookEventId: string;
  metadata?: Record<string, unknown>;
}

interface AtsEventJob {
  provider: 'greenhouse' | 'lever';
  action: string;
  payload: object;
}

interface SessionTimeoutJob {
  sessionId: string;
}

// ── Producers ─────────────────────────────────────────────────────────────────

export async function queueInboundMessage(job: InboundMessageJob): Promise<void> {
  await inboundMessageQueue.add(job);
}

export async function queueAtsEvent(job: AtsEventJob): Promise<void> {
  await atsEventQueue.add(job);
}

export async function scheduleSessionTimeout(
  sessionId: string,
  delayMs: number,
): Promise<void> {
  await sessionTimeoutQueue.add({ sessionId }, { delay: delayMs });
}

// ── Consumers ─────────────────────────────────────────────────────────────────

export function startWorkers(): void {
  inboundMessageQueue.process(async (job) => {
    logger.info('Processing inbound message', { jobId: job.id, from: job.data.from });
    const msg: InboundMessage = {
      channel: job.data.channel,
      from: job.data.from,
      body: job.data.body,
      metadata: job.data.metadata,
    };
    await processInboundMessage(msg);
  });

  atsEventQueue.process(async (job) => {
    logger.info('Processing ATS event', {
      jobId: job.id,
      provider: job.data.provider,
      action: job.data.action,
    });
    await handleAtsEvent(job.data.provider, job.data.action, job.data.payload);
  });

  sessionTimeoutQueue.process(async (job) => {
    const { sessionId } = job.data;
    logger.info('Processing session timeout', { sessionId });
    const { default: prisma } = await import('../db/client');
    await prisma.interviewSession.updateMany({
      where: {
        id: sessionId,
        state: { notIn: ['DONE', 'TIMEOUT', 'ERROR'] },
      },
      data: { state: 'TIMEOUT', finishedAt: new Date() },
    });
  });

  // Error logging for all queues
  for (const queue of [inboundMessageQueue, atsEventQueue, sessionTimeoutQueue]) {
    queue.on('failed', (job, err) => {
      logger.error('Queue job failed', {
        queue: queue.name,
        jobId: job.id,
        err: err.message,
        attempts: job.attemptsMade,
      });
    });
  }

  logger.info('Queue workers started');
}
