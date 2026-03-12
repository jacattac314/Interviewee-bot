/**
 * Field extraction from candidate replies.
 *
 * Strategy:
 *  1. Try to parse the reply as JSON directly.
 *  2. Try to extract a JSON object embedded in freeform text (```json ... ``` blocks).
 *  3. Fall back to Claude API for natural-language extraction.
 *
 * Each step falls through to the next only if extraction fails.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';
import { normalizeSalary } from './salary';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Main extraction entry point ───────────────────────────────────────────────

export async function extractFields(
  rawText: string,
  step: string,
): Promise<Record<string, unknown>> {
  // 1. Direct JSON parse
  const direct = tryParseJson(rawText);
  if (direct) return postProcess(direct, step);

  // 2. Extract JSON block from markdown fences
  const fenced = tryExtractFencedJson(rawText);
  if (fenced) return postProcess(fenced, step);

  // 3. Claude fallback extraction
  logger.info('Falling back to Claude extraction', { step });
  const llmResult = await extractWithClaude(rawText, step);
  return postProcess(llmResult, step);
}

// ── JSON parsers ──────────────────────────────────────────────────────────────

function tryParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tryExtractFencedJson(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (!fenceMatch) {
    // Try to find a bare JSON object in the text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    return tryParseJson(objectMatch[0]);
  }
  return tryParseJson(fenceMatch[1]);
}

// ── Claude LLM extraction ────────────────────────────────────────────────────

const STEP_PROMPTS: Record<string, string> = {
  HANDSHAKE: 'Extract: handshake_nonce (string), candidate_name (string), preferred_channel (sms|email).',
  BACKGROUND:
    'Extract: summary (string), years_experience_total (int), automation_tools (array of strings), sql_comfort (none|basic|intermediate|advanced).',
  COMPENSATION:
    'Extract salary information: min (int), max (int), currency (string, default USD), cadence (yearly|monthly|hourly). Also extract any notes (string).',
  ARCHITECTURE:
    'Extract: orchestrator (string), trigger (string), llm object with used (bool) and provider (string), steps (array), error_handling object, data_storage object.',
  DEBUG_SCENARIO: 'Extract: debug_plan (array of strings), monitoring_tools (array of strings).',
  CLOSE: 'Extract: closing (string — the candidate closing remarks).',
};

async function extractWithClaude(text: string, step: string): Promise<Record<string, unknown>> {
  const stepPrompt = STEP_PROMPTS[step] ?? 'Extract all key-value information as JSON.';

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are extracting structured data from a job candidate's reply.
Interview step: ${step}
${stepPrompt}

Candidate reply:
"""
${text}
"""

Return ONLY a valid JSON object with the extracted fields. If a field is missing, omit it. No explanation, no markdown fences.`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') return {};

    return tryParseJson(content.text) ?? {};
  } catch (err) {
    logger.error('Claude extraction failed', { err, step });
    return {};
  }
}

// ── Post-processing ───────────────────────────────────────────────────────────

function postProcess(data: Record<string, unknown>, step: string): Record<string, unknown> {
  // Normalize salary in COMPENSATION step
  if (step === 'COMPENSATION' && data.salary) {
    data.salary = normalizeSalary(data.salary as Record<string, unknown>);
  }

  // Sanitize: remove any keys that look like injections
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof key === 'string' && key.length < 100) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
