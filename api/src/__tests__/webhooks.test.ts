/**
 * Unit tests for webhook signature validation:
 * - Twilio: X-Twilio-Signature validation
 * - Lever: replay protection (duplicate nonce, expired timestamp)
 */

// Mock dependencies before imports
jest.mock('../db/client', () => ({
  __esModule: true,
  default: {
    webhookEvent: {
      create: jest.fn().mockResolvedValue({ id: 'mock-webhook-event-id' }),
    },
  },
}));

jest.mock('../queue/workers', () => ({
  queueInboundMessage: jest.fn().mockResolvedValue(undefined),
  queueAtsEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock twilio validateRequest
jest.mock('twilio', () => {
  const validateRequest = jest.fn();
  return {
    __esModule: true,
    default: Object.assign(jest.fn(), { validateRequest }),
    validateRequest,
  };
});

import { Request, Response } from 'express';
import twilio from 'twilio';
import { handleTwilioWebhook } from '../webhooks/twilio';
import { handleLeverWebhook } from '../webhooks/lever';

const { validateRequest } = twilio;

// Helper to create a mock Express request
function makeMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

// Helper to create a mock Express response
function makeMockRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

// ── Twilio Webhook Tests ──────────────────────────────────────────────────────

describe('Twilio webhook signature validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.APP_URL = 'https://example.com';
  });

  it('accepts requests with valid Twilio signature', async () => {
    (validateRequest as jest.Mock).mockReturnValue(true);

    const req = makeMockReq({
      headers: { 'x-twilio-signature': 'valid-signature' },
      body: { From: '+15551234567', Body: 'Hello', MessageSid: 'SM123' },
    });
    const res = makeMockRes();

    await handleTwilioWebhook(req, res);

    expect(validateRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('<Response></Response>');
  });

  it('rejects requests with invalid Twilio signature', async () => {
    (validateRequest as jest.Mock).mockReturnValue(false);

    const req = makeMockReq({
      headers: { 'x-twilio-signature': 'invalid-signature' },
      body: { From: '+15551234567', Body: 'Hello', MessageSid: 'SM456' },
    });
    const res = makeMockRes();

    await handleTwilioWebhook(req, res);

    expect(validateRequest).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
  });

  it('rejects requests with missing Twilio signature', async () => {
    (validateRequest as jest.Mock).mockReturnValue(false);

    const req = makeMockReq({
      headers: {},
      body: { From: '+15551234567', Body: 'Hello' },
    });
    const res = makeMockRes();

    await handleTwilioWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── Lever Webhook Tests ───────────────────────────────────────────────────────

describe('Lever webhook replay protection', () => {
  const LEVER_TOKEN = 'lever-secret-token';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LEVER_WEBHOOK_TOKEN = LEVER_TOKEN;
  });

  function makeValidLeverSignature(timestamp: string, body: string): string {
    const crypto = require('crypto') as typeof import('crypto');
    const payload = `${timestamp}\n${body}`;
    return crypto.createHmac('sha256', LEVER_TOKEN).update(payload).digest('hex');
  }

  it('rejects requests with an expired timestamp (outside 5-minute window)', async () => {
    // Timestamp from 10 minutes ago
    const oldTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
    const body = JSON.stringify({ event: 'candidateHired' });
    const signature = makeValidLeverSignature(oldTimestamp, body);

    const req = makeMockReq({
      headers: {
        'lever-signature': signature,
        'lever-timestamp': oldTimestamp,
      },
      body: { event: 'candidateHired' },
    });
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
    const res = makeMockRes();

    await handleLeverWebhook(req as Request, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
  });

  it('rejects duplicate nonce (replay attack)', async () => {
    // Use a fresh timestamp within the window
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ event: 'candidateStageChange' });
    // Use a unique signature to avoid collision with other tests
    const uniqueToken = 'unique-replay-token-' + Date.now();
    const originalToken = process.env.LEVER_WEBHOOK_TOKEN;
    process.env.LEVER_WEBHOOK_TOKEN = uniqueToken;

    const crypto = require('crypto') as typeof import('crypto');
    const payload = `${timestamp}\n${body}`;
    const signature = crypto.createHmac('sha256', uniqueToken).update(payload).digest('hex');

    function makeReq() {
      const req = makeMockReq({
        headers: {
          'lever-signature': signature,
          'lever-timestamp': timestamp,
        },
        body: { event: 'candidateStageChange' },
      });
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
      return req;
    }

    const res1 = makeMockRes();
    const res2 = makeMockRes();

    // First request should succeed
    await handleLeverWebhook(makeReq() as Request, res1);
    expect(res1.status).toHaveBeenCalledWith(200);

    // Second request with same nonce should be rejected
    await handleLeverWebhook(makeReq() as Request, res2);
    expect(res2.status).toHaveBeenCalledWith(403);
    expect(res2.send).toHaveBeenCalledWith('Forbidden');

    process.env.LEVER_WEBHOOK_TOKEN = originalToken;
  });

  it('accepts valid Lever webhook with correct signature and fresh timestamp', async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ event: 'candidateArchived' });
    const signature = makeValidLeverSignature(timestamp, body);

    // Use a unique signature to avoid nonce collision from other tests
    const uniqueToken = 'unique-valid-token-' + Date.now();
    const originalToken = process.env.LEVER_WEBHOOK_TOKEN;
    process.env.LEVER_WEBHOOK_TOKEN = uniqueToken;

    const crypto2 = require('crypto') as typeof import('crypto');
    const payload2 = `${timestamp}\n${body}`;
    const sig2 = crypto2.createHmac('sha256', uniqueToken).update(payload2).digest('hex');

    const req = makeMockReq({
      headers: {
        'lever-signature': sig2,
        'lever-timestamp': timestamp,
      },
      body: { event: 'candidateArchived' },
    });
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
    const res = makeMockRes();

    await handleLeverWebhook(req as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });

    process.env.LEVER_WEBHOOK_TOKEN = originalToken;
  });
});
