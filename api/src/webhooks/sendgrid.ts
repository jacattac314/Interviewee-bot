/**
 * SendGrid Inbound Parse webhook handler.
 *
 * SendGrid posts multipart/form-data to this endpoint whenever an
 * inbound email is parsed. We verify the signed event key (if configured)
 * and then queue the message for interview orchestration.
 *
 * Docs: https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import prisma from '../db/client';
import { logger } from '../logger';
import { queueInboundMessage } from '../queue/workers';

/**
 * Verify SendGrid signed event webhook.
 * Uses HMAC-SHA256 with the Inbound Parse webhook key.
 */
function verifySendGridSignature(req: Request): boolean {
  const webhookKey = process.env.SENDGRID_INBOUND_WEBHOOK_KEY;
  if (!webhookKey) {
    // If no key is configured, skip verification (dev/test mode)
    logger.warn('SENDGRID_INBOUND_WEBHOOK_KEY not set; skipping signature check');
    return true;
  }

  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string | undefined;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string | undefined;

  if (!signature || !timestamp) {
    return false;
  }

  // Concatenate timestamp + raw body then verify
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf-8') ?? JSON.stringify(req.body);
  const payload = timestamp + rawBody;
  const expected = crypto
    .createHmac('sha256', webhookKey)
    .update(payload)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function handleSendGridWebhook(req: Request, res: Response): Promise<void> {
  const isValid = verifySendGridSignature(req);

  if (!isValid) {
    logger.warn('SendGrid signature validation failed');
    await prisma.webhookEvent.create({
      data: {
        provider: 'sendgrid',
        signatureStatus: 'INVALID',
        payload: req.body as object,
      },
    });
    res.status(403).send('Forbidden');
    return;
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: 'sendgrid',
      signatureStatus: 'VALID',
      payload: req.body as object,
    },
  });

  // SendGrid Inbound Parse fields
  const from: string = req.body.from ?? '';
  const subject: string = req.body.subject ?? '';
  const text: string = req.body.text ?? '';
  const html: string = req.body.html ?? '';

  // Extract sender email address from "Name <email>" format
  const emailMatch = from.match(/<([^>]+)>/) ?? [null, from];
  const senderEmail = (emailMatch[1] ?? from).trim().toLowerCase();

  logger.info('SendGrid inbound email received', { from: senderEmail, subject });

  await queueInboundMessage({
    channel: 'EMAIL',
    from: senderEmail,
    body: text || html,
    webhookEventId: webhookEvent.id,
    metadata: { subject, rawFrom: from },
  });

  // SendGrid retries on non-2xx — respond 200 quickly
  res.status(200).json({ received: true });
}
