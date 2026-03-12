/**
 * Salary normalization utilities.
 *
 * Converts various salary representations into a canonical structure:
 * { min: number, max: number, currency: string, cadence: "yearly"|"monthly"|"hourly" }
 */

export interface NormalizedSalary {
  min: number;
  max: number;
  currency: string;
  cadence: 'yearly' | 'monthly' | 'hourly';
  raw?: unknown;
}

const CADENCE_MAP: Record<string, 'yearly' | 'monthly' | 'hourly'> = {
  year: 'yearly',
  yearly: 'yearly',
  annual: 'yearly',
  annually: 'yearly',
  month: 'monthly',
  monthly: 'monthly',
  hour: 'hourly',
  hourly: 'hourly',
  per_hour: 'hourly',
};

// Multiply to convert to yearly for band comparisons
const TO_YEARLY: Record<NormalizedSalary['cadence'], number> = {
  yearly: 1,
  monthly: 12,
  hourly: 2080,
};

export function normalizeSalary(raw: Record<string, unknown>): NormalizedSalary {
  const rawMin = parseNumber(raw.min ?? raw.salary_min ?? raw.base_min);
  const rawMax = parseNumber(raw.max ?? raw.salary_max ?? raw.base_max ?? rawMin);
  const currency = ((raw.currency as string | undefined) ?? 'USD').toUpperCase();
  const rawCadence = ((raw.cadence as string | undefined) ?? 'yearly').toLowerCase().replace(/\s+/g, '_');
  const cadence = CADENCE_MAP[rawCadence] ?? 'yearly';

  return {
    min: Math.min(rawMin, rawMax),
    max: Math.max(rawMin, rawMax),
    currency,
    cadence,
    raw,
  };
}

export function salaryToYearly(salary: NormalizedSalary): { min: number; max: number } {
  const multiplier = TO_YEARLY[salary.cadence];
  return {
    min: salary.min * multiplier,
    max: salary.max * multiplier,
  };
}

function parseNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // Remove currency symbols, commas, k suffix
    const cleaned = v
      .replace(/[$,€£¥]/g, '')
      .replace(/k$/i, '000')
      .trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
