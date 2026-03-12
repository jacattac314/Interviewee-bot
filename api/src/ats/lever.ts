/**
 * Lever Data API integration.
 *
 * Creates an opportunity (candidate) in Lever with extracted interview data.
 * Docs: https://hire.lever.co/developer/documentation
 */

import prisma from '../db/client';
import { logger } from '../logger';
import { buildCandidatePacket } from '../routes/reviewer';

const LEVER_BASE = 'https://api.lever.co/v1';

function getHeaders(): Record<string, string> {
  const apiKey = process.env.LEVER_API_KEY ?? '';
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
  };
}

export async function syncToLever(applicationId: string): Promise<void> {
  const packet = await buildCandidatePacket(applicationId);
  if (!packet) throw new Error(`Application ${applicationId} not found`);

  const { candidate, extracted } = packet;

  const nameParts = (candidate.fullName ?? 'Unknown Candidate').split(' ');
  const leverPayload = {
    name: candidate.fullName ?? 'Unknown Candidate',
    headline: 'AI Operations Analyst Applicant',
    emails: candidate.primaryEmail ? [candidate.primaryEmail] : [],
    phones: candidate.primaryPhone ? [{ value: candidate.primaryPhone, type: 'mobile' }] : [],
    tags: ['ai-ops-analyst', 'automation-interview'],
    notes: buildLeverNote(extracted),
    links: (extracted.links as string[]) ?? [],
  };

  const resp = await fetch(`${LEVER_BASE}/opportunities`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(leverPayload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Lever sync failed: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const opportunityId = String((data.data as Record<string, unknown>)?.id ?? '');

  const conn = await prisma.integrationConnection.findFirst({
    where: { system: 'lever' },
  });
  if (conn) {
    await prisma.integrationSync.create({
      data: {
        applicationId,
        integrationConnectionId: conn.id,
        status: 'SUCCESS',
        lastPayload: { opportunity_id: opportunityId, ...leverPayload },
        lastAttemptAt: new Date(),
      },
    });
  }

  logger.info('Synced to Lever', { applicationId, opportunityId });
}

function buildLeverNote(extracted: Record<string, unknown>): string {
  const lines: string[] = ['Fairly AI Ops Interview Summary'];

  if (extracted.summary) lines.push(`\nBackground:\n${extracted.summary}`);
  if (extracted.orchestrator) lines.push(`\nOrchestrator: ${extracted.orchestrator}`);
  if (extracted.salary) {
    const s = extracted.salary as Record<string, unknown>;
    lines.push(`\nSalary target: ${s.min}–${s.max} ${s.currency}/${s.cadence}`);
  }
  if (extracted.debug_plan) {
    lines.push(`\nDebug approach:\n${(extracted.debug_plan as string[]).join('\n')}`);
  }

  return lines.join('\n');
}
