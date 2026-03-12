/**
 * Greenhouse Recruiting webhook handler.
 *
 * Greenhouse signs webhook payloads with an HMAC-SHA256 derived from
 * a shared secret. The signature is in the Signature header.
 *
 * Docs: https://developers.greenhouse.io/webhooks/overview
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import prisma from '../db/client';
import { logger } from '../logger';
import { queueAtsEvent } from '../queue/workers';

function verifyGreenhouseSignature(req: Request): boolean {
  const secret = process.env.GREENHOUSE_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('GREENHOUSE_WEBHOOK_SECRET not set; skipping signature check');
    return true;
  }

  const signature = req.headers['signature'] as string | undefined;
  if (!signature) return false;

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf-8') ?? JSON.stringify(req.body);

  // Greenhouse uses HMAC-SHA256 of the raw body
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expected.toLowerCase()),
    );
  } catch {
    return false;
  }
}

export async function handleGreenhouseWebhook(req: Request, res: Response): Promise<void> {
  const isValid = verifyGreenhouseSignature(req);

  if (!isValid) {
    logger.warn('Greenhouse signature validation failed');
    await prisma.webhookEvent.create({
      data: {
        provider: 'greenhouse',
        signatureStatus: 'INVALID',
        payload: req.body as object,
      },
    });
    res.status(403).send('Forbidden');
    return;
  }

  await prisma.webhookEvent.create({
    data: {
      provider: 'greenhouse',
      signatureStatus: 'VALID',
      payload: req.body as object,
    },
  });

  const action: string = req.body.action ?? '';
  logger.info('Greenhouse webhook received', { action });

  await queueAtsEvent({ provider: 'greenhouse', action, payload: req.body as object });

  res.status(200).json({ received: true });
}
