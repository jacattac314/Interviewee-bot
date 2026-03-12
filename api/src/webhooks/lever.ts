/**
 * Lever webhook handler.
 *
 * Lever signs webhook payloads using HMAC-SHA256 with a token + timestamp
 * approach to prevent replay attacks.
 *
 * Docs: https://hire.lever.co/developer/webhooks
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import prisma from '../db/client';
import { logger } from '../logger';
import { queueAtsEvent } from '../queue/workers';

// Simple nonce cache to prevent replay attacks (in production, use Redis)
const usedNonces = new Set<string>();
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function verifyLeverSignature(req: Request): boolean {
  const token = process.env.LEVER_WEBHOOK_TOKEN;
  if (!token) {
    logger.warn('LEVER_WEBHOOK_TOKEN not set; skipping signature check');
    return true;
  }

  const signature = req.headers['lever-signature'] as string | undefined;
  const timestamp = req.headers['lever-timestamp'] as string | undefined;

  if (!signature || !timestamp) return false;

  // Replay attack: reject if timestamp is outside window
  const requestTime = parseInt(timestamp, 10) * 1000;
  if (Math.abs(Date.now() - requestTime) > REPLAY_WINDOW_MS) {
    logger.warn('Lever webhook replay attack detected (timestamp out of window)', { timestamp });
    return false;
  }

  // Reject if nonce already used
  const nonce = `${timestamp}:${signature}`;
  if (usedNonces.has(nonce)) {
    logger.warn('Lever webhook replay attack detected (duplicate nonce)', { nonce });
    return false;
  }
  usedNonces.add(nonce);
  // Clean up old nonces (simple in-memory; use Redis TTL in production)
  setTimeout(() => usedNonces.delete(nonce), REPLAY_WINDOW_MS);

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf-8') ?? JSON.stringify(req.body);
  const payload = `${timestamp}\n${rawBody}`;
  const expected = crypto.createHmac('sha256', token).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function handleLeverWebhook(req: Request, res: Response): Promise<void> {
  const isValid = verifyLeverSignature(req);

  if (!isValid) {
    logger.warn('Lever signature validation failed');
    await prisma.webhookEvent.create({
      data: {
        provider: 'lever',
        signatureStatus: 'INVALID',
        payload: req.body as object,
      },
    });
    res.status(403).send('Forbidden');
    return;
  }

  await prisma.webhookEvent.create({
    data: {
      provider: 'lever',
      signatureStatus: 'VALID',
      payload: req.body as object,
    },
  });

  const event: string = req.body.event ?? '';
  logger.info('Lever webhook received', { event });

  await queueAtsEvent({ provider: 'lever', action: event, payload: req.body as object });

  res.status(200).json({ received: true });
}
