/**
 * Admin routes — job requisitions, reviewers, integration connections.
 *
 * Protected by REVIEWER_API_KEY (same key as reviewer for MVP;
 * separate admin key in production).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client';

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-reviewer-key'];
  if (key !== process.env.REVIEWER_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.use(requireAdmin);

// ── Job Requisitions ─────────────────────────────────────────────────────────

router.get('/requisitions', async (_req: Request, res: Response) => {
  const reqs = await prisma.jobRequisition.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(reqs);
});

router.post(
  '/requisitions',
  [body('title').trim().notEmpty(), body('description').optional().isString()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { title, description } = req.body as { title: string; description?: string };
    const req_ = await prisma.jobRequisition.create({ data: { title, description } });
    res.status(201).json(req_);
  },
);

// ── Reviewers ─────────────────────────────────────────────────────────────────

router.get('/reviewers', async (_req: Request, res: Response) => {
  const reviewers = await prisma.reviewer.findMany();
  res.json(reviewers);
});

router.post(
  '/reviewers',
  [
    body('name').trim().notEmpty(),
    body('email').isEmail(),
    body('role').isIn(['HIRING_MANAGER', 'RECRUITER']),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { name, email, role } = req.body as { name: string; email: string; role: 'HIRING_MANAGER' | 'RECRUITER' };
    const reviewer = await prisma.reviewer.upsert({
      where: { email },
      create: { name, email, role },
      update: { name, role },
    });
    res.status(201).json(reviewer);
  },
);

// ── Integration Connections ───────────────────────────────────────────────────

router.get('/integrations', async (_req: Request, res: Response) => {
  const conns = await prisma.integrationConnection.findMany({
    select: { id: true, system: true }, // never expose credentials_ref
  });
  res.json(conns);
});

router.post(
  '/integrations',
  [body('system').isIn(['greenhouse', 'lever', 'other'])],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const { system } = req.body as { system: string };
    // credentialsRef stored as a reference — actual secrets live in env vars
    const conn = await prisma.integrationConnection.create({
      data: { system, credentialsRef: { ref: 'env' } },
    });
    res.status(201).json({ id: conn.id, system: conn.system });
  },
);

// ── GDPR/CCPA Data Export ─────────────────────────────────────────────────────

router.get('/candidates/:id/export', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      endpoints: {
        include: {
          consentEvents: true,
          sessions: {
            include: {
              messages: true,
              extractedFields: true,
            },
          },
        },
      },
      applications: {
        include: {
          auditLogs: true,
        },
      },
    },
  });

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  await prisma.auditLog.create({
    data: {
      actor: 'admin',
      action: 'data_export_requested',
      details: { candidateId: id },
    },
  });

  res.json({ exportedAt: new Date().toISOString(), candidate });
});

// ── Right to Erasure ──────────────────────────────────────────────────────────

router.delete('/candidates/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: { endpoints: true },
  });

  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }

  await prisma.candidate.update({
    where: { id },
    data: {
      primaryEmail: '[REDACTED]',
      primaryPhone: '[REDACTED]',
      fullName: '[REDACTED]',
    },
  });

  for (const endpoint of candidate.endpoints) {
    await prisma.endpoint.update({
      where: { id: endpoint.id },
      data: { value: '[REDACTED]' },
    });
  }

  await prisma.auditLog.create({
    data: {
      actor: 'admin',
      action: 'candidate_data_erased',
      details: { candidateId: id, reason: reason ?? null },
    },
  });

  res.json({ erased: true });
});

// ── Health / metrics stub ─────────────────────────────────────────────────────

router.get('/metrics', async (_req: Request, res: Response) => {
  const [totalApps, completedApps, advancedApps, rejectedApps] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: 'COMPLETE' } }),
    prisma.application.count({ where: { status: 'ADVANCED' } }),
    prisma.application.count({ where: { status: 'REJECTED' } }),
  ]);

  const webhookStats = await prisma.webhookEvent.groupBy({
    by: ['provider', 'signatureStatus'],
    _count: { id: true },
  });

  res.json({
    applications: { total: totalApps, completed: completedApps, advanced: advancedApps, rejected: rejectedApps },
    webhooks: webhookStats.map((s) => ({
      provider: s.provider,
      status: s.signatureStatus,
      count: s._count.id,
    })),
  });
});

// ── Retention Report ──────────────────────────────────────────────────────────

router.get('/retention-report', async (req: Request, res: Response) => {
  const retentionDays = parseInt((req.query.retentionDays as string) ?? '365', 10);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const candidatesEligibleForErasure = await prisma.application.count({
    where: {
      status: { in: ['REJECTED', 'COMPLETE'] },
      createdAt: { lt: cutoffDate },
    },
  });

  res.json({
    candidatesEligibleForErasure,
    cutoffDate: cutoffDate.toISOString(),
    retentionDays,
  });
});

export default router;
