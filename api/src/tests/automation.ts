/**
 * Automation Test Runner
 *
 * Runs capability tests against the candidate's automation endpoint
 * after the interview concludes:
 *
 *  1. webhook_round_trip — send a JSON payload; expect a transformed response
 *  2. extraction_task    — send unstructured text; expect structured fields
 *  3. failure_drill      — send malformed payload; expect error-handling response
 *
 * Results are persisted to AutomationTestRun.
 */

import { InterviewSession } from '@prisma/client';
import prisma from '../db/client';
import { sendMessage } from '../channels';
import { logger } from '../logger';

const REPLY_TIMEOUT_MS = parseInt(process.env.TEST_REPLY_TIMEOUT_MS ?? '300000', 10); // 5 minutes default

interface TestDefinition {
  type: string;
  outboundPayload: object;
  validate: (response: string) => { pass: boolean; details: object };
}

const TESTS: TestDefinition[] = [
  {
    type: 'webhook_round_trip',
    outboundPayload: {
      test: 'webhook_round_trip',
      instruction: 'Return the sum of the following numbers as JSON: {"result": <sum>}',
      numbers: [7, 13, 42],
    },
    validate: (response) => {
      try {
        const parsed = JSON.parse(extractJson(response));
        const expected = 62; // 7+13+42
        return {
          pass: Number(parsed.result) === expected,
          details: { expected, got: parsed.result },
        };
      } catch {
        return { pass: false, details: { error: 'Could not parse JSON response' } };
      }
    },
  },
  {
    type: 'extraction_task',
    outboundPayload: {
      test: 'extraction_task',
      instruction:
        'Extract the person name, company, and role from the following text as JSON: {"name":"...","company":"...","role":"..."}',
      text: 'Hi, I am Jordan Lee, a Senior DevOps Engineer at AcmeCorp.',
    },
    validate: (response) => {
      try {
        const parsed = JSON.parse(extractJson(response)) as Record<string, string>;
        const pass =
          parsed.name?.toLowerCase().includes('jordan') &&
          parsed.company?.toLowerCase().includes('acme') &&
          typeof parsed.role === 'string';
        return { pass, details: { extracted: parsed } };
      } catch {
        return { pass: false, details: { error: 'Could not parse extraction result' } };
      }
    },
  },
  {
    type: 'failure_drill',
    outboundPayload: {
      test: 'failure_drill',
      // Deliberately malformed: unexpected schema
      unexpected_field_zzz: null,
      data: undefined,
    },
    validate: (response) => {
      // Pass if the candidate's automation returns any structured error response
      // rather than silently succeeding or crashing
      const hasErrorSignal =
        response.toLowerCase().includes('error') ||
        response.toLowerCase().includes('unknown') ||
        response.toLowerCase().includes('unexpected') ||
        response.toLowerCase().includes('fail') ||
        response.toLowerCase().includes('invalid');
      return {
        pass: hasErrorSignal,
        details: { responsePreview: response.slice(0, 200) },
      };
    },
  },
];

export async function runAutomationTests(session: InterviewSession): Promise<void> {
  const endpoint = await prisma.endpoint.findUnique({ where: { id: session.endpointId } });
  if (!endpoint) return;

  for (const test of TESTS) {
    const startTime = Date.now();
    let result: 'PASS' | 'FAIL' | 'ERROR' | 'TIMEOUT' = 'TIMEOUT';
    let details: object = {};

    try {
      logger.info('Running automation test', { sessionId: session.id, testType: test.type });

      const instruction = JSON.stringify(test.outboundPayload);
      await sendMessage({ channel: endpoint.type, to: endpoint.value, body: instruction });

      await prisma.message.create({
        data: {
          interviewSessionId: session.id,
          direction: 'OUTBOUND',
          channel: endpoint.type,
          body: instruction,
          metadata: { testType: test.type },
        },
      });

      // Wait for a reply (poll the DB for an inbound message after our outbound)
      const reply = await waitForReply(session.id, startTime, REPLY_TIMEOUT_MS);

      if (!reply) {
        result = 'TIMEOUT';
        details = { message: 'No reply within timeout window' };
      } else {
        const validation = test.validate(reply);
        result = validation.pass ? 'PASS' : 'FAIL';
        details = validation.details;
      }
    } catch (err) {
      result = 'ERROR';
      details = { error: String(err) };
      logger.error('Automation test error', { sessionId: session.id, testType: test.type, err });
    }

    const latencyMs = Date.now() - startTime;

    await prisma.automationTestRun.create({
      data: {
        interviewSessionId: session.id,
        testType: test.type,
        result,
        latencyMs,
        details,
      },
    });

    logger.info('Automation test complete', {
      sessionId: session.id,
      testType: test.type,
      result,
      latencyMs,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForReply(
  sessionId: string,
  sinceMs: number,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = sinceMs + timeoutMs;
  const pollInterval = 5000; // check every 5s

  while (Date.now() < deadline) {
    const msg = await prisma.message.findFirst({
      where: {
        interviewSessionId: sessionId,
        direction: 'INBOUND',
        occurredAt: { gte: new Date(sinceMs) },
      },
      orderBy: { occurredAt: 'desc' },
    });

    if (msg) return msg.body;

    await sleep(pollInterval);
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text.trim();
}
