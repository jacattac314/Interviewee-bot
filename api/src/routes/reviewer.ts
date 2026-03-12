/**
 * Reviewer Console API.
 *
 * All routes require the REVIEWER_API_KEY header.
 *
 * GET  /api/reviewer/applications          — Pipeline list
 * GET  /api/reviewer/applications/:id      — Candidate detail + transcript
 * POST /api/reviewer/applications/:id/score — Submit rubric scores
 * POST /api/reviewer/applications/:id/advance — Advance candidate
 * POST /api/reviewer/applications/:id/reject  — Reject with reason
 * POST /api/reviewer/applications/:id/sync-ats — Push to ATS
 * GET  /api/reviewer/applications/:id/export  — Candidate packet JSON
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import prisma from '../db/client';
import { logger } from '../logger';
import { syncToGreenhouse } from '../ats/greenhouse';
import { syncToLever } from '../ats/lever';

const router = Router();

// ── Auth middleware ────────────────────────────────────────────────────────────

function requireReviewer(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-reviewer-key'] ?? req.query.key;
  if (key !== process.env.REVIEWER_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.use(requireReviewer);

// ── GET /api/reviewer/applications ────────────────────────────────────────────

router.get(
  '/applications',
  [
    query('status').optional().isIn(['IN_PROGRESS', 'COMPLETE', 'REJECTED', 'ADVANCED', 'ON_HOLD']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const status = req.query.status as string | undefined;
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const skip = (page - 1) * limit;

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where: status ? { status: status as 'IN_PROGRESS' } : undefined,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          candidate: { select: { fullName: true, primaryEmail: true, primaryPhone: true } },
          sessions: {
            take: 1,
            orderBy: { startedAt: 'desc' },
            select: {
              state: true,
              currentStep: true,
              finishedAt: true,
              _count: { select: { messages: true } },
            },
          },
          evaluations: {
            take: 1,
            include: { scores: { select: { score: true } } },
          },
        },
      }),
      prisma.application.count({ where: status ? { status: status as 'IN_PROGRESS' } : undefined }),
    ]);

    const rows = applications.map((app) => {
      const session = app.sessions[0];
      const scores = app.evaluations[0]?.scores ?? [];
      const avgScore =
        scores.length > 0
          ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
          : null;

      return {
        id: app.id,
        status: app.status,
        createdAt: app.createdAt,
        candidate: app.candidate,
        sessionState: session?.state ?? null,
        sessionStep: session?.currentStep ?? null,
        completedAt: session?.finishedAt ?? null,
        messageCount: session?._count.messages ?? 0,
        avgScore,
      };
    });

    res.json({ data: rows, total, page, limit });
  },
);

// ── GET /api/reviewer/applications/:id ────────────────────────────────────────

router.get(
  '/applications/:id',
  [param('id').isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const packet = await buildCandidatePacket(req.params.id);
    if (!packet) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    res.json(packet);
  },
);

// ── POST /api/reviewer/applications/:id/score ─────────────────────────────────

router.post(
  '/applications/:id/score',
  [
    param('id').isUUID(),
    body('reviewerId').isUUID(),
    body('scores').isArray({ min: 1 }),
    body('scores.*.dimension').notEmpty(),
    body('scores.*.score').isInt({ min: 1, max: 5 }),
    body('scores.*.rationale').optional().isString(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { reviewerId, scores } = req.body as {
      reviewerId: string;
      scores: Array<{ dimension: string; score: number; rationale?: string }>;
    };

    const application = await prisma.application.findUnique({ where: { id: req.params.id } });
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const evaluation = await prisma.evaluation.create({
      data: { applicationId: req.params.id },
    });

    await prisma.score.createMany({
      data: scores.map((s) => ({
        evaluationId: evaluation.id,
        reviewerId,
        dimension: s.dimension,
        score: s.score,
        rationale: s.rationale,
      })),
    });

    await prisma.auditLog.create({
      data: {
        applicationId: req.params.id,
        actor: 'reviewer',
        action: 'scores_submitted',
        details: { evaluationId: evaluation.id, reviewerId, scoreCount: scores.length },
      },
    });

    res.status(201).json({ evaluationId: evaluation.id });
  },
);

// ── POST /api/reviewer/applications/:id/advance ───────────────────────────────

router.post(
  '/applications/:id/advance',
  [param('id').isUUID(), body('reviewerId').isUUID(), body('note').optional().isString()],
  async (req: Request, res: Response): Promise<void> => {
    await updateApplicationStatus(req, res, 'ADVANCED', 'candidate_advanced');
  },
);

// ── POST /api/reviewer/applications/:id/reject ────────────────────────────────

router.post(
  '/applications/:id/reject',
  [
    param('id').isUUID(),
    body('reviewerId').isUUID(),
    body('reasonCode').notEmpty(),
    body('note').optional().isString(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    await updateApplicationStatus(req, res, 'REJECTED', 'candidate_rejected');
  },
);

// ── POST /api/reviewer/applications/:id/sync-ats ─────────────────────────────

router.post(
  '/applications/:id/sync-ats',
  [param('id').isUUID(), body('provider').isIn(['greenhouse', 'lever'])],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const provider: 'greenhouse' | 'lever' = req.body.provider;

    try {
      if (provider === 'greenhouse') {
        await syncToGreenhouse(req.params.id);
      } else {
        await syncToLever(req.params.id);
      }

      await prisma.auditLog.create({
        data: {
          applicationId: req.params.id,
          actor: 'reviewer',
          action: 'ats_sync_triggered',
          details: { provider },
        },
      });

      res.json({ success: true, provider });
    } catch (err) {
      logger.error('ATS sync failed', { applicationId: req.params.id, provider, err });
      res.status(500).json({ error: 'ATS sync failed', detail: String(err) });
    }
  },
);

// ── GET /api/reviewer/applications/:id/export ─────────────────────────────────

router.get(
  '/applications/:id/export',
  [param('id').isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const packet = await buildCandidatePacket(req.params.id);
    if (!packet) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    await prisma.auditLog.create({
      data: {
        applicationId: req.params.id,
        actor: 'reviewer',
        action: 'packet_exported',
      },
    });

    res.setHeader('Content-Disposition', `attachment; filename="candidate-${req.params.id}.json"`);
    res.json(packet);
  },
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function updateApplicationStatus(
  req: Request,
  res: Response,
  status: 'ADVANCED' | 'REJECTED',
  auditAction: string,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  const { reviewerId, note, reasonCode } = req.body as {
    reviewerId: string;
    note?: string;
    reasonCode?: string;
  };

  await prisma.application.update({
    where: { id: req.params.id },
    data: { status },
  });

  if (note) {
    await prisma.reviewNote.create({
      data: { applicationId: req.params.id, reviewerId, note },
    });
  }

  await prisma.auditLog.create({
    data: {
      applicationId: req.params.id,
      actor: 'reviewer',
      action: auditAction,
      details: { reviewerId, reasonCode, note },
    },
  });

  res.json({ success: true, status });
}

// ── Exported helper used by ATS sync ─────────────────────────────────────────

export async function buildCandidatePacket(
  applicationId: string,
): Promise<Record<string, unknown> | null> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: true,
      sessions: {
        include: {
          messages: { orderBy: { occurredAt: 'asc' } },
          extractedFields: true,
          testRuns: true,
          endpoint: { select: { type: true, value: true, status: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 1,
      },
      evaluations: {
        include: {
          scores: { include: { reviewer: { select: { name: true, role: true } } } },
        },
      },
      reviewNotes: {
        include: { reviewer: { select: { name: true } } },
      },
    },
  });

  if (!application) return null;

  const session = application.sessions[0];
  const extracted: Record<string, unknown> = {};
  for (const field of session?.extractedFields ?? []) {
    extracted[field.key] = field.valueJson ?? field.valueText;
  }

  return {
    application_id: application.id,
    status: application.status,
    created_at: application.createdAt,
    candidate: {
      name: application.candidate.fullName,
      email: application.candidate.primaryEmail,
      phone: application.candidate.primaryPhone,
      location: application.candidate.location,
      endpoints: [session?.endpoint],
    },
    extracted,
    transcript: session?.messages.map((m) => ({
      direction: m.direction,
      channel: m.channel,
      body: m.body,
      at: m.occurredAt,
    })),
    automation_tests: session?.testRuns.map((t) => ({
      type: t.testType,
      result: t.result,
      latency_ms: t.latencyMs,
      details: t.details,
    })),
    rubric: {
      evaluations: application.evaluations.map((ev) => ({
        id: ev.id,
        rubric_version: ev.rubricVersion,
        created_at: ev.createdAt,
        scores: ev.scores.map((s) => ({
          dimension: s.dimension,
          score: s.score,
          rationale: s.rationale,
          reviewer: s.reviewer.name,
          reviewer_role: s.reviewer.role,
        })),
      })),
    },
    review_notes: application.reviewNotes.map((n) => ({
      note: n.note,
      reviewer: n.reviewer.name,
      at: n.createdAt,
    })),
  };
}

export default router;
