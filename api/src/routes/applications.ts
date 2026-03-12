/**
 * Candidate intake REST endpoints.
 *
 * POST /api/applications        — Submit endpoint + consent, start interview
 * GET  /api/applications/:id    — Get application status (for candidate status page)
 * POST /api/applications/:id/retry — Re-send current question
 */

import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db/client';
import { logger } from '../logger';
import { startInterviewSession } from '../interview/orchestrator';
import { scheduleSessionTimeout } from '../queue/workers';

const router = Router();

// ── POST /api/applications ─────────────────────────────────────────────────────

router.post(
  '/',
  [
    body('channel').isIn(['SMS', 'EMAIL']).withMessage('channel must be SMS or EMAIL'),
    body('endpointValue').trim().notEmpty().withMessage('endpointValue is required'),
    body('consentGiven').isBoolean().withMessage('consentGiven must be true'),
    body('consentGiven').custom((v: boolean) => v === true).withMessage('Consent is required'),
    body('jobRequisitionId').optional().isUUID(),
    body('candidateName').optional().trim(),
    body('location').optional().trim(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { channel, endpointValue, candidateName, location, jobRequisitionId } = req.body as {
      channel: 'SMS' | 'EMAIL';
      endpointValue: string;
      candidateName?: string;
      location?: string;
      jobRequisitionId?: string;
    };

    // Normalize endpoint value
    const normalizedValue =
      channel === 'EMAIL' ? endpointValue.trim().toLowerCase() : endpointValue.trim();

    // Find or create job requisition
    let reqId = jobRequisitionId;
    if (!reqId) {
      const defaultReq = await prisma.jobRequisition.findFirst({
        where: { isActive: true },
      });
      if (defaultReq) {
        reqId = defaultReq.id;
      } else {
        const created = await prisma.jobRequisition.create({
          data: { title: 'AI Operations Analyst' },
        });
        reqId = created.id;
      }
    }

    // Find or create candidate
    const existingCandidate = await prisma.candidate.findFirst({
      where:
        channel === 'EMAIL'
          ? { primaryEmail: normalizedValue }
          : { primaryPhone: normalizedValue },
    });

    const candidate = existingCandidate ?? (await prisma.candidate.create({
      data: {
        fullName: candidateName,
        primaryEmail: channel === 'EMAIL' ? normalizedValue : undefined,
        primaryPhone: channel === 'SMS' ? normalizedValue : undefined,
        location,
      },
    }));

    // Find or create endpoint
    const endpoint = await prisma.endpoint.upsert({
      where: { id: uuidv4() }, // force create; we'll look it up differently
      create: {
        candidateId: candidate.id,
        type: channel,
        value: normalizedValue,
        status: 'PENDING',
      },
      update: {},
    });

    // Record consent
    const consentVersion = 'v1-2024';
    await prisma.consentEvent.create({
      data: {
        endpointId: endpoint.id,
        channel,
        consentTextVersion: consentVersion,
        source: 'web_form',
      },
    });

    // Create application
    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobRequisitionId: reqId,
        status: 'IN_PROGRESS',
      },
    });

    await prisma.auditLog.create({
      data: {
        applicationId: application.id,
        actor: 'system',
        action: 'application_created',
        details: { channel, consentVersion, endpointId: endpoint.id },
      },
    });

    // Start interview session (sends first question)
    const sessionId = await startInterviewSession(application.id, endpoint.id, channel);

    // Schedule timeout
    const timeoutHours = parseInt(process.env.INTERVIEW_SESSION_TIMEOUT_HOURS ?? '48', 10);
    await scheduleSessionTimeout(sessionId, timeoutHours * 60 * 60 * 1000);

    logger.info('Application created', {
      applicationId: application.id,
      channel,
      sessionId,
    });

    res.status(201).json({
      applicationId: application.id,
      sessionId,
      message: `Interview started! Check your ${channel === 'SMS' ? 'phone' : 'email'} for the first question.`,
    });
  },
);

// ── GET /api/applications/:id ─────────────────────────────────────────────────

router.get(
  '/:id',
  [param('id').isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: {
        candidate: { select: { fullName: true } },
        sessions: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: {
            state: true,
            currentStep: true,
            startedAt: true,
            finishedAt: true,
          },
        },
      },
    });

    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const session = application.sessions[0];
    res.json({
      applicationId: application.id,
      status: application.status,
      candidateName: application.candidate.fullName,
      session: session
        ? {
            state: session.state,
            currentStep: session.currentStep,
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
          }
        : null,
    });
  },
);

// ── POST /api/applications/:id/retry ─────────────────────────────────────────

router.post(
  '/:id/retry',
  [param('id').isUUID()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const session = await prisma.interviewSession.findFirst({
      where: {
        applicationId: req.params.id,
        state: { notIn: ['DONE', 'TIMEOUT', 'ERROR'] },
      },
      include: { endpoint: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      res.status(404).json({ error: 'No active session found' });
      return;
    }

    // Re-send the last outbound message
    const lastOutbound = await prisma.message.findFirst({
      where: { interviewSessionId: session.id, direction: 'OUTBOUND' },
      orderBy: { occurredAt: 'desc' },
    });

    if (lastOutbound) {
      const { sendMessage } = await import('../channels');
      await sendMessage({
        channel: session.endpoint.type,
        to: session.endpoint.value,
        body: lastOutbound.body,
      });
    }

    res.json({ message: 'Question resent' });
  },
);

export default router;
