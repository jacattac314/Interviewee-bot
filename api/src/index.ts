/**
 * Express application entry point.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import multer from 'multer';

import { logger } from './logger';
import { startWorkers } from './queue/workers';
import { startTimeoutScheduler } from './interview/scheduler';

// Routes
import applicationRoutes from './routes/applications';
import reviewerRoutes from './routes/reviewer';
import adminRoutes from './routes/admin';
import accommodationRoutes from './routes/accommodation';

// Webhooks
import { handleTwilioWebhook } from './webhooks/twilio';
import { handleSendGridWebhook } from './webhooks/sendgrid';
import { handleGreenhouseWebhook } from './webhooks/greenhouse';
import { handleLeverWebhook } from './webhooks/lever';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Security middleware ───────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-reviewer-key'],
  }),
);

// ── Body parsing ─────────────────────────────────────────────────────────────
// Capture raw body for webhook signature verification before JSON parsing

app.use((req: Request, _res: Response, next: NextFunction) => {
  // Store raw body for signature verification
  let rawBody = Buffer.alloc(0);
  req.on('data', (chunk: Buffer) => {
    rawBody = Buffer.concat([rawBody, chunk]);
  });
  req.on('end', () => {
    (req as Request & { rawBody: Buffer }).rawBody = rawBody;
    next();
  });
});

// Twilio sends application/x-www-form-urlencoded
app.use('/webhooks/twilio', express.urlencoded({ extended: false }));

// SendGrid Inbound Parse sends multipart/form-data
const upload = multer();
app.use('/webhooks/sendgrid', upload.none());

// Standard JSON for everything else
app.use(express.json());

// ── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Webhook endpoints ────────────────────────────────────────────────────────

app.post('/webhooks/twilio', handleTwilioWebhook);
app.post('/webhooks/sendgrid', handleSendGridWebhook);
app.post('/webhooks/greenhouse', handleGreenhouseWebhook);
app.post('/webhooks/lever', handleLeverWebhook);

// ── REST API ─────────────────────────────────────────────────────────────────

app.use('/api/applications', applicationRoutes);
app.use('/api/reviewer', reviewerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/accommodation', accommodationRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`API listening on port ${PORT}`);
  startWorkers();
  startTimeoutScheduler();
});

export default app;
