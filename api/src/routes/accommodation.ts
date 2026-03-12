/**
 * Accommodation request endpoint.
 *
 * This bypasses the automation requirement — it's for candidates who cannot
 * use SMS/email bots. Complies with NYC LL 144 / CPPA ADMT accommodation
 * provisions.
 */

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../db/client';
import { sendEmail } from '../channels/email';
import { logger } from '../logger';

const router = Router();

router.post(
  '/request',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('message').trim().notEmpty().withMessage('Message is required'),
    body('applicationId').optional().isString(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, email, message, applicationId } = req.body as {
      name: string;
      email: string;
      message: string;
      applicationId?: string;
    };

    await prisma.auditLog.create({
      data: {
        actor: 'system',
        action: 'accommodation_requested',
        details: { name, email, message, applicationId: applicationId ?? null },
      },
    });

    const internalEmail = process.env.SENDGRID_FROM_EMAIL ?? 'hiring@example.com';
    const emailBody = [
      `Accommodation Request from ${name} <${email}>`,
      '',
      `Message: ${message}`,
      applicationId ? `Application ID: ${applicationId}` : '',
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    try {
      await sendEmail(internalEmail, `Accommodation Request — ${name}`, emailBody);
    } catch (err) {
      logger.error('Failed to send accommodation notification email', { name, email, err });
      // Do not fail the request — the audit log is the source of truth
    }

    res.json({
      received: true,
      message: "We'll reach out within 1 business day to arrange an accessible interview format.",
    });
  },
);

export default router;
