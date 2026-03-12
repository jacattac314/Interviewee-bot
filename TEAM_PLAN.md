# Team Plan: AI Operations Analyst Hiring System

## Overview

Automation-first hiring harness that interviews a candidate's automation endpoint (SMS or email) instead of collecting a resume. Built as a hybrid bot-first system per the PRD.

---

## Architecture Decision

**Stack**
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| API | Node.js + TypeScript + Express | Webhook-heavy I/O, async-friendly |
| ORM | Prisma + PostgreSQL | Type-safe schema, migration support |
| Queue | Bull + Redis | Decouple webhook ingress from slow LLM/ATS calls |
| SMS | Twilio SDK | Inbound webhooks + signature validation |
| Email | SendGrid Inbound Parse | Webhook delivery, retries on 5xx |
| AI Extraction | Anthropic Claude API | Field extraction from freeform candidate replies |
| Frontend | React + TypeScript + Vite | Candidate form + reviewer console |
| Infra | Docker Compose | Local dev + easy cloud migration |

**Design Pattern: Stateful Interview State Machine**
```
PENDING → HANDSHAKE → BACKGROUND → COMPENSATION → ARCHITECTURE → DEBUG → CLOSE → DONE
                                                                              ↓
                                                                           TIMEOUT
```

---

## Repository Structure

```
/
├── api/                        # Backend service
│   ├── src/
│   │   ├── db/                 # Prisma schema + client
│   │   ├── webhooks/           # Inbound webhook handlers
│   │   │   ├── twilio.ts       # SMS inbound (signature validation)
│   │   │   ├── sendgrid.ts     # Email inbound (SendGrid Inbound Parse)
│   │   │   ├── greenhouse.ts   # ATS event webhooks
│   │   │   └── lever.ts        # ATS event webhooks
│   │   ├── interview/
│   │   │   ├── orchestrator.ts # State machine + question dispatch
│   │   │   ├── questions.ts    # Structured question bank
│   │   │   └── timeout.ts      # Session timeout worker
│   │   ├── extraction/
│   │   │   ├── parser.ts       # JSON + natural language field extraction
│   │   │   └── salary.ts       # Salary normalization
│   │   ├── tests/
│   │   │   └── automation.ts   # Webhook round-trip + extraction capability tests
│   │   ├── ats/
│   │   │   ├── greenhouse.ts   # Harvest API sync
│   │   │   └── lever.ts        # Lever Data API sync
│   │   ├── routes/
│   │   │   ├── applications.ts # Candidate intake REST endpoints
│   │   │   ├── reviewer.ts     # Reviewer console API
│   │   │   └── admin.ts        # Admin / config endpoints
│   │   ├── channels/
│   │   │   ├── sms.ts          # Twilio outbound helpers
│   │   │   └── email.ts        # SendGrid outbound helpers
│   │   ├── queue/
│   │   │   └── workers.ts      # Bull queue workers
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT + API key auth
│   │   │   └── validate.ts     # Request validation
│   │   └── index.ts            # Express app entry
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── tsconfig.json
│
├── web/                        # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Apply.tsx       # Candidate endpoint submission
│   │   │   ├── Status.tsx      # Interview status tracker
│   │   │   ├── Dashboard.tsx   # Recruiter pipeline view
│   │   │   └── Review.tsx      # Candidate detail + scoring
│   │   ├── components/
│   │   │   ├── EndpointForm.tsx
│   │   │   ├── ScoreCard.tsx
│   │   │   ├── Transcript.tsx
│   │   │   └── RubricScorer.tsx
│   │   ├── api/                # API client
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml
├── .env.example
└── package.json                # Workspace root
```

---

## Work Breakdown by Sprint

### Sprint 0 — Foundation (Days 1–3)
**Owner: Backend Lead**
- [ ] Monorepo scaffold (workspaces)
- [ ] Docker Compose (Postgres, Redis, API, Web)
- [ ] Prisma schema (all 13 entities from PRD ER diagram)
- [ ] `.env.example` with all required vars
- [ ] Express app bootstrap + health check

### Sprint 1 — Webhook Ingress (Days 4–8)
**Owner: Backend Lead**
- [ ] Twilio inbound SMS handler + `X-Twilio-Signature` validation
- [ ] SendGrid Inbound Parse handler + signature verification
- [ ] Greenhouse webhook handler + HMAC validation
- [ ] Lever webhook handler + signed payload validation
- [ ] Replay-attack protection (nonce cache, timestamp window)
- [ ] Raw event storage in `WEBHOOK_EVENT` table

### Sprint 2 — Interview Orchestrator (Days 9–13)
**Owner: Backend Lead + AI Lead**
- [ ] State machine (PENDING → DONE/TIMEOUT)
- [ ] Handshake challenge/response
- [ ] Question dispatch over SMS + email
- [ ] Field extraction (JSON parse + Claude fallback for freeform)
- [ ] Salary normalization
- [ ] Session timeout worker (Bull)

### Sprint 3 — Automation Tests + Channels (Days 14–17)
**Owner: Backend Lead**
- [ ] Outbound SMS (Twilio)
- [ ] Outbound email (SendGrid)
- [ ] Webhook round-trip test (send JSON payload, expect transform)
- [ ] Extraction capability test (unstructured → structured)
- [ ] Failure drill (malformed payload → error handling response)

### Sprint 4 — Reviewer Console API (Days 18–21)
**Owner: Backend Lead**
- [ ] Applications list endpoint (filterable, paginated)
- [ ] Candidate detail + transcript endpoint
- [ ] Rubric scoring endpoints (create/update score per dimension)
- [ ] Advance/reject with reason codes
- [ ] Candidate packet export (JSON + PDF stub)
- [ ] ATS sync endpoints (Greenhouse + Lever)

### Sprint 5 — Frontend (Days 22–28)
**Owner: Frontend Lead**
- [ ] Candidate Apply page (endpoint form + consent)
- [ ] Interview Status page (polling / websocket)
- [ ] Recruiter Dashboard (pipeline table)
- [ ] Candidate Review page (transcript + rubric scorer + actions)
- [ ] Mobile-responsive (SMS candidates often on mobile)

### Sprint 6 — Compliance + Hardening (Days 29–33)
**Owner: Full team**
- [ ] Consent text versioning
- [ ] Data retention + soft-delete workflows
- [ ] AEDT/ADMT notice copy and opt-out path
- [ ] Accommodation request flow (human interview fallback)
- [ ] Audit log completeness review
- [ ] Security scan (OWASP top 10 checklist)

---

## Rubric Dimensions

| Dimension | Weight | What to look for |
|-----------|--------|-----------------|
| API / Webhook Literacy | 25% | Signature validation, retry logic, error codes |
| Automation Design Quality | 25% | Modularity, observability, failure handling |
| LLM / Prompt Craft | 20% | Structured outputs, edge case handling |
| Debugging Approach | 15% | Schema drift handling, monitoring tooling |
| Communication Clarity | 15% | Concise, machine-readable responses |

---

## Compliance Checklist

- [ ] SMS consent captured pre-first-message with opt-out disclosure
- [ ] Email CAN-SPAM: truthful headers, unsubscribe path
- [ ] GDPR/CCPA: purpose limitation, retention period disclosed
- [ ] AEDT notice (NYC LL 144 + CPPA ADMT): "AI assists; humans decide"
- [ ] Accommodation path: email alternative + human interview fallback
- [ ] Bias monitoring stub: flag rubric dimension score variance >2σ
- [ ] All webhook signatures validated; invalid requests rejected 403
- [ ] PII encrypted at rest; transcripts in object storage with access log

---

## Environment Variables Required

```
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# SendGrid
SENDGRID_API_KEY=
SENDGRID_INBOUND_PARSE_WEBHOOK_KEY=
SENDGRID_FROM_EMAIL=

# Anthropic (field extraction)
ANTHROPIC_API_KEY=

# ATS
GREENHOUSE_API_KEY=
GREENHOUSE_WEBHOOK_SECRET=
LEVER_API_KEY=
LEVER_WEBHOOK_TOKEN=

# App
JWT_SECRET=
APP_URL=
REVIEWER_TOKEN=
```

---

## Success Metrics (MVP Targets)

| Metric | Target |
|--------|--------|
| Handshake success rate | ≥ 85% |
| Interview completion rate | ≥ 60% of verified |
| Time-to-first-review | < 2 hours from completion |
| Webhook signature failure rate | < 0.1% of valid traffic |
| Median interview latency | < 10 minutes end-to-end |
