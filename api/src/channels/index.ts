/**
 * Unified channel dispatcher — routes outbound messages to SMS or Email.
 */

import { sendSms } from './sms';
import { sendEmail } from './email';

export interface OutboundMessage {
  channel: 'SMS' | 'EMAIL';
  to: string;
  body: string;
  subject?: string;
}

export async function sendMessage(msg: OutboundMessage): Promise<void> {
  if (msg.channel === 'SMS') {
    await sendSms(msg.to, msg.body);
  } else {
    await sendEmail(msg.to, msg.subject ?? 'Your Fairly Application', msg.body);
  }
}
