/**
 * Twilio inbound SMS webhook handler.
 *
 * Validates X-Twilio-Signature before processing so that spoofed
 * requests are rejected before touching the database.
 *
 * Twilio docs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

import { Request, Response } from 'express';
import twilio from 'twilio';
import prisma from '../db/client';
import { logger } from '../logger';
import { queueInboundMessage } from '../queue/workers';

const { validateRequest } = twilio;

export async function handleTwilioWebhook(req: Request, res: Response): Promise<void> {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const url = `${process.env.APP_URL}/webhooks/twilio`;

  // ── Signature validation ──────────────────────────────────────────────────
  const signature = req.headers['x-twilio-signature'] as string | undefined;
  const isValid = validateRequest(authToken, signature ?? '', url, req.body as Record<string, string>);

  if (!isValid) {
    logger.warn('Twilio signature validation failed', { signature });
    await prisma.webhookEvent.create({
      data: {
        provider: 'twilio',
        signatureStatus: 'INVALID',
        payload: req.body as object,
      },
    });
    res.status(403).send('Forbidden');
    return;
  }

  // ── Store raw event ───────────────────────────────────────────────────────
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: 'twilio',
      signatureStatus: 'VALID',
      payload: req.body as object,
    },
  });

  const from: string = req.body.From ?? '';
  const body: string = req.body.Body ?? '';
  const messageSid: string = req.body.MessageSid ?? '';

  logger.info('Twilio inbound SMS received', { from, messageSid });

  // ── Queue for async processing ────────────────────────────────────────────
  await queueInboundMessage({
    channel: 'SMS',
    from,
    body,
    webhookEventId: webhookEvent.id,
    metadata: { messageSid },
  });

  // Twilio expects a 200 TwiML response quickly; empty TwiML = no auto-reply
  res.set('Content-Type', 'text/xml');
  res.status(200).send('<Response></Response>');
}
