/**
 * Twilio SMS outbound sender.
 */

import twilio from 'twilio';
import { logger } from '../logger';

let client: ReturnType<typeof twilio> | null = null;

function getClient(): ReturnType<typeof twilio> {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio credentials not configured');
    client = twilio(sid, token);
  }
  return client;
}

export async function sendSms(to: string, body: string): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) throw new Error('TWILIO_PHONE_NUMBER not configured');

  try {
    const message = await getClient().messages.create({ from, to, body });
    logger.info('SMS sent', { to, sid: message.sid });
  } catch (err) {
    logger.error('SMS send failed', { to, err });
    throw err;
  }
}
