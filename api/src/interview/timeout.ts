/**
 * Session timeout worker — scans for sessions past their timeoutAt
 * and marks them as TIMEOUT. Run as a scheduled job or via Bull.
 */

import prisma from '../db/client';
import { logger } from '../logger';

export async function expireTimedOutSessions(): Promise<void> {
  const expired = await prisma.interviewSession.updateMany({
    where: {
      timeoutAt: { lte: new Date() },
      state: { notIn: ['DONE', 'TIMEOUT', 'ERROR'] },
    },
    data: { state: 'TIMEOUT', finishedAt: new Date() },
  });

  if (expired.count > 0) {
    logger.info('Expired sessions marked as TIMEOUT', { count: expired.count });
  }
}
