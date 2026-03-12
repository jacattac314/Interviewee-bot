/**
 * Greenhouse Harvest API integration.
 *
 * Syncs a completed application into Greenhouse as a candidate + application.
 * Docs: https://developers.greenhouse.io/harvest.html
 */

import prisma from '../db/client';
import { logger } from '../logger';
import { buildCandidatePacket } from '../routes/reviewer';

const GH_BASE = 'https://harvest.greenhouse.io/v1';

function getHeaders(): Record<string, string> {
  const apiKey = process.env.GREENHOUSE_API_KEY ?? '';
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
    'On-Behalf-Of': process.env.GREENHOUSE_ON_BEHALF_OF ?? '',
  };
}

export async function syncToGreenhouse(applicationId: string): Promise<void> {
  const packet = await buildCandidatePacket(applicationId);
  if (!packet) throw new Error(`Application ${applicationId} not found`);

  const { candidate, extracted } = packet;

  // Create or update candidate in Greenhouse
  const ghPayload = {
    first_name: candidate.fullName?.split(' ')[0] ?? 'Unknown',
    last_name: candidate.fullName?.split(' ').slice(1).join(' ') ?? '',
    email_addresses: candidate.primaryEmail
      ? [{ value: candidate.primaryEmail, type: 'personal' }]
      : [],
    phone_numbers: candidate.primaryPhone
      ? [{ value: candidate.primaryPhone, type: 'mobile' }]
      : [],
    applications: [
      {
        job_id: null, // configure per requisition
        source_id: null,
      },
    ],
    notes: buildNotes(extracted),
  };

  const resp = await fetch(`${GH_BASE}/candidates`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(ghPayload),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Greenhouse sync failed: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const externalId = String(data.id ?? '');

  // Record the sync
  const conn = await prisma.integrationConnection.findFirst({
    where: { system: 'greenhouse' },
  });
  if (conn) {
    await prisma.integrationSync.create({
      data: {
        applicationId,
        integrationConnectionId: conn.id,
        status: 'SUCCESS',
        lastPayload: { external_id: externalId, ...ghPayload },
        lastAttemptAt: new Date(),
      },
    });
  }

  logger.info('Synced to Greenhouse', { applicationId, externalId });
}

function buildNotes(extracted: Record<string, unknown>): string {
  const lines: string[] = ['--- Fairly AI Ops Interview Results ---'];

  if (extracted.summary) lines.push(`Background: ${extracted.summary}`);
  if (extracted.orchestrator) lines.push(`Orchestrator: ${extracted.orchestrator}`);
  if (extracted.salary) {
    const s = extracted.salary as Record<string, unknown>;
    lines.push(`Salary: ${s.min}–${s.max} ${s.currency}/${s.cadence}`);
  }
  if (extracted.error_handling) lines.push(`Error handling: ${JSON.stringify(extracted.error_handling)}`);

  return lines.join('\n');
}
