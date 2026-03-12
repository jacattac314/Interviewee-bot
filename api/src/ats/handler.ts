/**
 * ATS event handler — processes status update webhooks from Greenhouse and Lever
 * and syncs them back to the local application record.
 */

import prisma from '../db/client';
import { logger } from '../logger';

export async function handleAtsEvent(
  provider: 'greenhouse' | 'lever',
  action: string,
  payload: object,
): Promise<void> {
  logger.info('Handling ATS event', { provider, action });

  if (provider === 'greenhouse') {
    await handleGreenhouseEvent(action, payload as Record<string, unknown>);
  } else if (provider === 'lever') {
    await handleLeverEvent(action, payload as Record<string, unknown>);
  }
}

async function handleGreenhouseEvent(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Example: candidate moved to next stage
  if (action === 'candidate_stage_change') {
    const externalId = String((payload.application as Record<string, unknown>)?.id ?? '');
    if (!externalId) return;

    const sync = await prisma.integrationSync.findFirst({
      where: { lastPayload: { path: ['external_id'], equals: externalId } },
    });

    if (sync) {
      await prisma.auditLog.create({
        data: {
          applicationId: sync.applicationId,
          actor: 'system',
          action: 'ats_stage_change',
          details: { provider: 'greenhouse', action, externalId },
        },
      });
    }
  }
}

async function handleLeverEvent(
  action: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (action === 'candidateStageChange') {
    const opportunityId = String((payload.data as Record<string, unknown>)?.opportunityId ?? '');
    if (!opportunityId) return;

    const sync = await prisma.integrationSync.findFirst({
      where: { lastPayload: { path: ['opportunity_id'], equals: opportunityId } },
    });

    if (sync) {
      await prisma.auditLog.create({
        data: {
          applicationId: sync.applicationId,
          actor: 'system',
          action: 'ats_stage_change',
          details: { provider: 'lever', action, opportunityId },
        },
      });
    }
  }
}
