/**
 * Structured question bank for the AI Ops Analyst interview.
 * Each question includes the prompt text, a JSON schema hint for the
 * candidate's automation, and the required fields to extract.
 *
 * Based on the sample interview script from the PRD.
 */

export interface Question {
  id: string;
  step: string;
  text: string;
  jsonHint: string;
  requiredFields: string[];
  nextStep: string | null;
}

export const QUESTIONS: Question[] = [
  {
    id: 'q0_handshake',
    step: 'HANDSHAKE',
    text: `Welcome to the AI Operations Analyst application process at Fairly.

We interview your automation — not your resume. Please confirm you control this endpoint.

Reply in JSON:
{"handshake_nonce":"__NONCE__","candidate_name":"Your Name","preferred_channel":"sms|email"}`,
    jsonHint: '{"handshake_nonce":"string","candidate_name":"string","preferred_channel":"sms|email"}',
    requiredFields: ['handshake_nonce', 'candidate_name'],
    nextStep: 'BACKGROUND',
  },
  {
    id: 'q1_background',
    step: 'BACKGROUND',
    text: `Thanks! Now let's learn about you.

Summarize your professional background relevant to automation + AI orchestration.

Reply in JSON:
{
  "summary": "...",
  "years_experience_total": 0,
  "automation_tools": ["n8n","zapier","make","other"],
  "api_experience": {"webhooks": true, "rest": true, "auth": ["api_key","oauth2"]},
  "sql_comfort": "none|basic|intermediate|advanced"
}`,
    jsonHint:
      '{"summary":"string","years_experience_total":"int","automation_tools":["string"],"api_experience":{"webhooks":"bool","rest":"bool"},"sql_comfort":"string"}',
    requiredFields: ['summary', 'years_experience_total', 'automation_tools'],
    nextStep: 'COMPENSATION',
  },
  {
    id: 'q2_compensation',
    step: 'COMPENSATION',
    text: `What salary range are you targeting for a remote US role?

Reply in JSON:
{
  "salary": {"min": 100000, "max": 130000, "currency": "USD", "cadence": "yearly"},
  "notes": "optional context"
}`,
    jsonHint: '{"salary":{"min":"int","max":"int","currency":"string","cadence":"string"},"notes":"string"}',
    requiredFields: ['salary'],
    nextStep: 'ARCHITECTURE',
  },
  {
    id: 'q3_architecture',
    step: 'ARCHITECTURE',
    text: `This is the core question: describe the technical architecture of the automation you built to receive and reply to this interview.

Include: triggers, orchestration tool, LLM usage, data stores, error handling, and observability.

Reply in JSON:
{
  "orchestrator": "n8n|zapier|make|custom",
  "trigger": "twilio_webhook|sendgrid_inbound_parse|other",
  "llm": {"used": true, "provider": "openai|anthropic|other", "why": "..."},
  "steps": [{"name":"...","type":"webhook|transform|llm_call|storage|notify","notes":"..."}],
  "error_handling": {"retries": true, "dead_letter_queue": false, "alerts": "email|slack|none"},
  "data_storage": {"type": "airtable|postgres|sheets|none", "pii_handling": "redact|minimize|encrypt"},
  "links": []
}`,
    jsonHint:
      '{"orchestrator":"string","trigger":"string","llm":{"used":"bool"},"steps":[],"error_handling":{},"data_storage":{}}',
    requiredFields: ['orchestrator', 'trigger', 'steps'],
    nextStep: 'DEBUG_SCENARIO',
  },
  {
    id: 'q4_debug',
    step: 'DEBUG_SCENARIO',
    text: `Debugging scenario: if an upstream API changes and returns a JSON schema you don't expect, what do you do first?

Reply in JSON:
{
  "debug_plan": ["step 1", "step 2", "step 3"],
  "monitoring_tools": ["datadog", "slack", "logs"]
}`,
    jsonHint: '{"debug_plan":["string"],"monitoring_tools":["string"]}',
    requiredFields: ['debug_plan'],
    nextStep: 'CLOSE',
  },
  {
    id: 'q5_close',
    step: 'CLOSE',
    text: `Last question — anything else you'd like reviewers to know about you or your automation?

Reply in JSON:
{"closing": "..."}

Your application will be reviewed by a human hiring manager. We'll follow up within 3 business days.`,
    jsonHint: '{"closing":"string"}',
    requiredFields: [],
    nextStep: null,
  },
];

export function getQuestion(step: string): Question | undefined {
  return QUESTIONS.find((q) => q.step === step);
}

export function getNextStep(currentStep: string): string | null {
  const q = getQuestion(currentStep);
  return q?.nextStep ?? null;
}
