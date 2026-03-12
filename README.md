# Interviewee Bot — AI Operations Analyst Hiring System

An automation-first hiring harness for the **AI Operations Analyst** role at Fairly.

Instead of reviewing resumes, we interview your automation.
Candidates submit an SMS number or email address connected to a bot they built (Zapier, n8n, custom). Our system conducts a structured interview through that endpoint, extracts structured data, runs capability tests, and presents a reviewer-ready packet to the hiring team.

---

## Architecture

```
Candidate Web Form
        │
        ▼
  Express API (Node.js + TypeScript)
        │
        ├── Webhook ingress (Twilio SMS / SendGrid Email)
        │         └── Signature validation → Bull queue → Interview orchestrator
        │
        ├── Interview orchestrator (state machine)
        │         HANDSHAKE → BACKGROUND → COMPENSATION → ARCHITECTURE → DEBUG → CLOSE → DONE
        │
        ├── Field extractor (JSON parse → Claude AI fallback)
        │
        ├── Automation test runner (round-trip, extraction, failure drill)
        │
        └── Reviewer Console API + ATS sync (Greenhouse / Lever)

React Frontend
  ├── /apply          — Candidate endpoint submission + consent
  ├── /status/:id     — Interview progress tracker
  ├── /reviewer       — Recruiter pipeline dashboard
  └── /reviewer/:id   — Candidate detail + rubric scoring
```

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Twilio account (for SMS)
- SendGrid account (for email)
- Anthropic API key (for AI field extraction)

### 1. Clone and configure

```bash
cp .env.example .env
# Fill in your credentials
```

### 2. Start with Docker Compose

```bash
docker-compose up
```

This starts:
- PostgreSQL on `:5432`
- Redis on `:6379`
- API on `:3001`
- Web on `:3000`

### 3. Run database migrations

```bash
yarn db:migrate
```

### 4. Configure webhooks

**Twilio (SMS):**
Set your Twilio phone number's inbound webhook URL to:
```
https://your-domain.com/webhooks/twilio
```

**SendGrid (Email):**
Configure Inbound Parse to POST to:
```
https://your-domain.com/webhooks/sendgrid
```

**Greenhouse / Lever:**
Point your ATS webhooks to:
```
https://your-domain.com/webhooks/greenhouse
https://your-domain.com/webhooks/lever
```

---

## Interview Flow

Our system sends 6 messages to the candidate's automation:

| Step | What we ask |
|------|------------|
| `HANDSHAKE` | Confirm endpoint ownership via nonce |
| `BACKGROUND` | Professional background + automation tools |
| `COMPENSATION` | Salary range (normalized to yearly USD) |
| `ARCHITECTURE` | Full technical spec of the bot they built |
| `DEBUG_SCENARIO` | How they'd handle unexpected API schema changes |
| `CLOSE` | Anything else for reviewers |

Candidate automations can reply in **JSON** (preferred) or natural language (Claude extracts fields).

**Example architecture response from a candidate:**
```json
{
  "orchestrator": "n8n",
  "trigger": "twilio_webhook",
  "llm": {"used": true, "provider": "anthropic", "why": "structured extraction from freeform replies"},
  "steps": [
    {"name": "Receive webhook", "type": "webhook", "notes": "Twilio inbound SMS"},
    {"name": "Extract intent", "type": "llm_call", "notes": "Claude classifies question type"},
    {"name": "Store reply", "type": "storage", "notes": "Airtable with candidate_id key"},
    {"name": "Format response", "type": "transform", "notes": "JSON → TwiML"},
    {"name": "Send reply", "type": "notify", "notes": "Twilio respond with answer"}
  ],
  "error_handling": {"retries": true, "dead_letter_queue": false, "alerts": "slack"},
  "data_storage": {"type": "airtable", "pii_handling": "minimize"},
  "links": ["https://github.com/candidate/interview-bot"]
}
```

---

## Automation Capability Tests

After the interview, three automated tests run against the candidate's endpoint:

| Test | What it checks |
|------|---------------|
| `webhook_round_trip` | Can the bot compute `sum([7, 13, 42])` and return `{"result": 62}`? |
| `extraction_task` | Can it extract name/company/role from unstructured text? |
| `failure_drill` | Does it return an error response on a malformed payload? |

Pass/fail + latency are recorded in the reviewer packet.

---

## Reviewer Console

The reviewer console is at `/reviewer`. API key is set via `REVIEWER_API_KEY` env var.

**Rubric dimensions (each 1–5):**

| Dimension | Weight |
|-----------|--------|
| API / Webhook Literacy | 25% |
| Automation Design Quality | 25% |
| LLM / Prompt Craft | 20% |
| Debugging Approach | 15% |
| Communication Clarity | 15% |

---

## Security

- All inbound webhooks validated by HMAC signature before processing
- Replay-attack protection on Lever webhooks (timestamp window + nonce cache)
- Candidate PII encrypted at rest in PostgreSQL
- Strict `Content-Security-Policy` headers via Helmet
- Audit log on every reviewer action and data export
- Secrets managed via environment variables; never stored in DB

---

## Compliance

| Requirement | Implementation |
|-------------|---------------|
| SMS consent | Captured pre-first-message; stored in `ConsentEvent` table with text version |
| Email opt-out | Unsubscribe path disclosed in consent form |
| AI notice | "AI assists; humans decide" shown in apply form and consent text |
| Accommodation path | Link to human-interview alternative on apply page |
| Data retention | Configurable; deletion path via audit-logged admin endpoint |
| NYC LL 144 / CPPA ADMT | Automated scoring treated as assistive, not decisive; all decisions logged with human reviewer ID |

---

## Project Structure

```
/
├── api/                    # Express API + webhook handlers
│   ├── src/
│   │   ├── channels/       # Twilio SMS + SendGrid email senders
│   │   ├── db/             # Prisma client
│   │   ├── extraction/     # Field parser + salary normalizer
│   │   ├── interview/      # Orchestrator state machine + questions
│   │   ├── queue/          # Bull workers
│   │   ├── routes/         # REST API (applications, reviewer, admin)
│   │   ├── tests/          # Automation capability test runner
│   │   ├── webhooks/       # Twilio / SendGrid / Greenhouse / Lever
│   │   └── ats/            # Greenhouse + Lever sync
│   └── prisma/schema.prisma
├── web/                    # React frontend
│   └── src/pages/          # Apply, Status, Dashboard, Review
├── docker-compose.yml
├── .env.example
└── TEAM_PLAN.md            # Sprint plan + work breakdown
```

---

## Environment Variables

See [`.env.example`](./.env.example) for full reference.

Required for MVP:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- `ANTHROPIC_API_KEY`
- `REVIEWER_API_KEY`
- `APP_URL`
