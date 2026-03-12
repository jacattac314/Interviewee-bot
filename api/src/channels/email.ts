/**
 * SendGrid outbound email sender.
 */

import sgMail from '@sendgrid/mail';
import { logger } from '../logger';

sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? '');

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<void> {
  const from = {
    email: process.env.SENDGRID_FROM_EMAIL ?? 'hiring@example.com',
    name: process.env.SENDGRID_FROM_NAME ?? 'Fairly Hiring',
  };

  try {
    await sgMail.send({ to, from, subject, text });
    logger.info('Email sent', { to, subject });
  } catch (err) {
    logger.error('Email send failed', { to, subject, err });
    throw err;
  }
}
