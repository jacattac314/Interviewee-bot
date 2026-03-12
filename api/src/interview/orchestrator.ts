/**
 * Interview Orchestrator — State Machine
 *
 * Drives the conversation from PENDING → HANDSHAKE → ... → DONE.
 * Called by the queue worker for each inbound message.
 */

import crypto from 'crypto';
import { InterviewSession, SessionState } from '@prisma/client';
import prisma from '../db/client';
import { logger } from '../logger';
import { getQuestion, getNextStep, QUESTIONS } from './questions';
import { extractFields } from '../extraction/parser';
import { sendMessage } from '../channels';
import { runAutomationTests } from '../tests/automation';

export interface InboundMessage {
  channel: 'SMS' | 'EMAIL';
  from: string;   // E.164 or email
  body: string;
  metadata?: Record<string, unknown>;
}

// ── Entry point called by the queue worker ────────────────────────────────────

export async function processInboundMessage(msg: InboundMessage): Promise<void> {
  // Find the active session for this endpoint value
  const endpoint = await prisma.endpoint.findFirst({
    where: {
      value: msg.from,
      type: msg.channel,
      status: { in: ['PENDING', 'VERIFIED'] },
    },
    include: {
      sessions: {
        where: { state: { notIn: ['DONE', 'TIMEOUT', 'ERROR'] } },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!endpoint) {
    logger.warn('Received message from unknown endpoint', { from: msg.from });
    return;
  }

  const session = endpoint.sessions[0];
  if (!session) {
    logger.warn('No active session for endpoint', { endpointId: endpoint.id });
    return;
  }

  // Store the inbound message
  await prisma.message.create({
    data: {
      interviewSessionId: session.id,
      direction: 'INBOUND',
      channel: msg.channel,
      body: msg.body,
      metadata: msg.metadata as object | undefined,
    },
  });

  await advanceSession(session, msg);
}

// ── State machine ─────────────────────────────────────────────────────────────

async function advanceSession(
  session: InterviewSession,
  msg: InboundMessage,
): Promise<void> {
  const state = session.state as SessionState;

  switch (state) {
    case 'PENDING':
      // Should not happen (session transitions to HANDSHAKE on creation)
      await transitionTo(session, 'HANDSHAKE');
      await dispatchQuestion(session, 'HANDSHAKE', msg);
      break;

    case 'HANDSHAKE':
      await handleHandshake(session, msg);
      break;

    case 'BACKGROUND':
    case 'COMPENSATION':
    case 'ARCHITECTURE':
    case 'DEBUG_SCENARIO':
    case 'CLOSE':
      await handleInterviewStep(session, state, msg);
      break;

    default:
      logger.warn('Message received for terminal session state', {
        sessionId: session.id,
        state,
      });
  }
}

// ── Handshake ─────────────────────────────────────────────────────────────────

async function handleHandshake(
  session: InterviewSession,
  msg: InboundMessage,
): Promise<void> {
  const fields = await extractFields(msg.body, 'HANDSHAKE');
  const nonce = (session as InterviewSession & { timeoutAt: Date | null; currentStep: string }).currentStep;

  // The nonce was embedded in the question; retrieve from DB metadata
  const storedNonce = await getSessionNonce(session.id);

  if (!storedNonce || fields.handshake_nonce !== storedNonce) {
    logger.warn('Handshake nonce mismatch', { sessionId: session.id });
    await sendReply(session, msg.channel, `Hmm, the nonce didn't match. Let's try again.\n\nReply with: {"handshake_nonce":"${storedNonce}","candidate_name":"Your Name","preferred_channel":"sms|email"}`);
    return;
  }

  // Mark endpoint as verified
  await prisma.endpoint.update({
    where: { id: session.endpointId },
    data: { status: 'VERIFIED' },
  });

  // Save candidate name if provided
  if (fields.candidate_name) {
    const application = await prisma.application.findUnique({
      where: { id: session.applicationId },
      include: { candidate: true },
    });
    if (application && !application.candidate.fullName) {
      await prisma.candidate.update({
        where: { id: application.candidateId },
        data: { fullName: fields.candidate_name as string },
      });
    }
  }

  await saveExtractedFields(session.id, fields);
  await transitionTo(session, 'BACKGROUND');
  await dispatchQuestion(session, 'BACKGROUND', msg);
}

// ── Generic interview step handler ────────────────────────────────────────────

async function handleInterviewStep(
  session: InterviewSession,
  state: SessionState,
  msg: InboundMessage,
): Promise<void> {
  const question = getQuestion(state);
  if (!question) return;

  const fields = await extractFields(msg.body, state);

  // Check required fields
  const missingFields = question.requiredFields.filter(
    (f) => fields[f] === undefined || fields[f] === null,
  );

  if (missingFields.length > 0 && session.clarifyCount < (parseInt(process.env.MAX_CLARIFY_RETRIES ?? '2', 10))) {
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { clarifyCount: session.clarifyCount + 1 },
    });
    await sendReply(
      session,
      msg.channel,
      `I need a bit more info. Missing fields: ${missingFields.join(', ')}.\n\nPlease reply again with those included.`,
    );
    return;
  }

  await saveExtractedFields(session.id, fields);

  const nextStep = getNextStep(state);

  if (nextStep) {
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { clarifyCount: 0 },
    });
    await transitionTo(session, nextStep as SessionState);
    await dispatchQuestion(session, nextStep, msg);
  } else {
    // Interview complete — run automation tests, then mark done
    await completeInterview(session, msg);
  }
}

// ── Completion ────────────────────────────────────────────────────────────────

async function completeInterview(
  session: InterviewSession,
  msg: InboundMessage,
): Promise<void> {
  await transitionTo(session, 'DONE');

  // Run capability tests asynchronously (non-blocking for completion UX)
  runAutomationTests(session).catch((err) =>
    logger.error('Automation test run failed', { sessionId: session.id, err }),
  );

  await sendReply(
    session,
    msg.channel,
    `Your application is complete! A human reviewer will evaluate it and follow up within 3 business days.\n\nThank you for applying to Fairly.`,
  );

  await prisma.auditLog.create({
    data: {
      applicationId: session.applicationId,
      actor: 'system',
      action: 'interview_completed',
      details: { sessionId: session.id },
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function transitionTo(session: InterviewSession, newState: SessionState): Promise<void> {
  const isTerminal = ['DONE', 'TIMEOUT', 'ERROR'].includes(newState);
  await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      state: newState,
      currentStep: newState,
      finishedAt: isTerminal ? new Date() : undefined,
    },
  });
  logger.info('Session state transition', {
    sessionId: session.id,
    from: session.state,
    to: newState,
  });
}

async function dispatchQuestion(
  session: InterviewSession,
  step: string,
  msg: InboundMessage,
): Promise<void> {
  const question = getQuestion(step);
  if (!question) return;

  let text = question.text;

  // For HANDSHAKE: embed a fresh nonce
  if (step === 'HANDSHAKE') {
    const nonce = crypto.randomBytes(16).toString('hex');
    await storeSessionNonce(session.id, nonce);
    text = text.replace('__NONCE__', nonce);
  }

  await sendReply(session, msg.channel, text);
}

async function sendReply(
  session: InterviewSession,
  channel: 'SMS' | 'EMAIL',
  text: string,
): Promise<void> {
  const endpoint = await prisma.endpoint.findUnique({ where: { id: session.endpointId } });
  if (!endpoint) return;

  await sendMessage({ channel, to: endpoint.value, body: text });

  await prisma.message.create({
    data: {
      interviewSessionId: session.id,
      direction: 'OUTBOUND',
      channel,
      body: text,
    },
  });
}

async function saveExtractedFields(
  sessionId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const creates = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => ({
      interviewSessionId: sessionId,
      key,
      valueText: typeof value === 'string' ? value : undefined,
      valueJson: typeof value === 'object' ? (value as object) : undefined,
      confidence: 1.0,
    }));

  if (creates.length === 0) return;

  await prisma.extractedField.createMany({ data: creates });
}

async function storeSessionNonce(sessionId: string, nonce: string): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: 'system',
      action: 'nonce_issued',
      details: { sessionId, nonce },
    },
  });
}

async function getSessionNonce(sessionId: string): Promise<string | null> {
  const log = await prisma.auditLog.findFirst({
    where: { action: 'nonce_issued', details: { path: ['sessionId'], equals: sessionId } },
    orderBy: { occurredAt: 'desc' },
  });
  if (!log) return null;
  return (log.details as Record<string, string>)?.nonce ?? null;
}

// ── Session starter (called from application intake) ─────────────────────────

export async function startInterviewSession(
  applicationId: string,
  endpointId: string,
  channel: 'SMS' | 'EMAIL',
): Promise<string> {
  const timeoutHours = parseInt(process.env.INTERVIEW_SESSION_TIMEOUT_HOURS ?? '48', 10);

  const session = await prisma.interviewSession.create({
    data: {
      applicationId,
      endpointId,
      state: 'HANDSHAKE',
      currentStep: 'HANDSHAKE',
      timeoutAt: new Date(Date.now() + timeoutHours * 60 * 60 * 1000),
    },
  });

  // Dispatch the handshake question
  const endpoint = await prisma.endpoint.findUnique({ where: { id: endpointId } });
  if (endpoint) {
    const nonce = crypto.randomBytes(16).toString('hex');
    await storeSessionNonce(session.id, nonce);

    const q = getQuestion('HANDSHAKE');
    if (q) {
      const text = q.text.replace('__NONCE__', nonce);
      await sendMessage({ channel, to: endpoint.value, body: text });
      await prisma.message.create({
        data: {
          interviewSessionId: session.id,
          direction: 'OUTBOUND',
          channel,
          body: text,
        },
      });
    }
  }

  return session.id;
}
