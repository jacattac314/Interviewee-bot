/**
 * Session timeout scheduler.
 *
 * Polls every 5 minutes to expire sessions that have passed their timeoutAt.
 * Called once at application startup after workers are started.
 */

import { logger } from '../logger';
import { expireTimedOutSessions } from './timeout';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startTimeoutScheduler(): void {
  logger.info('Session timeout scheduler started', { intervalMs: POLL_INTERVAL_MS });

  setInterval(async () => {
    try {
      await expireTimedOutSessions();
    } catch (err) {
      logger.error('Error in timeout scheduler', { err });
    }
  }, POLL_INTERVAL_MS);
}
