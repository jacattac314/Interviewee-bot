// Bias monitoring — flags when score variance across candidates on a dimension
// exceeds 2 standard deviations, which may indicate inconsistent scoring.
// Does NOT automatically take any action — only logs a warning for human review.

import prisma from '../db/client';
import { logger } from '../logger';

export async function checkScoringBias(
  dimension: string,
): Promise<{ flagged: boolean; details: object }> {
  const scores = await prisma.score.findMany({
    where: { dimension },
    select: { score: true },
  });

  const count = scores.length;
  if (count === 0) {
    return { flagged: false, details: { dimension, mean: 0, stddev: 0, count: 0 } };
  }

  const values = scores.map((s) => s.score);
  const mean = values.reduce((sum, v) => sum + v, 0) / count;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / count;
  const stddev = Math.sqrt(variance);

  const details = { dimension, mean, stddev, count };

  if (stddev > 1.5) {
    logger.warn('Bias check flagged: high score variance detected', details);
    return { flagged: true, details };
  }

  return { flagged: false, details };
}

export async function runBiasCheck(): Promise<void> {
  const dimensions = [
    'api_webhook_literacy',
    'automation_design',
    'llm_prompt_craft',
    'debugging_approach',
    'communication',
  ];

  const results: Record<string, { flagged: boolean; details: object }> = {};
  for (const dimension of dimensions) {
    results[dimension] = await checkScoringBias(dimension);
  }

  await prisma.auditLog.create({
    data: {
      actor: 'system',
      action: 'bias_check_run',
      details: { results },
    },
  });
}
