import { normalizeSalary, salaryToYearly, NormalizedSalary } from '../extraction/salary';

describe('normalizeSalary', () => {
  it('handles plain min/max number object', () => {
    const result = normalizeSalary({ min: 100000, max: 150000 });
    expect(result.min).toBe(100000);
    expect(result.max).toBe(150000);
    expect(result.currency).toBe('USD');
    expect(result.cadence).toBe('yearly');
  });

  it('handles k-suffix strings ("120k", "150k")', () => {
    const result = normalizeSalary({ min: '120k', max: '150k' });
    expect(result.min).toBe(120000);
    expect(result.max).toBe(150000);
    expect(result.currency).toBe('USD');
    expect(result.cadence).toBe('yearly');
  });

  it('normalizes monthly cadence correctly', () => {
    const result = normalizeSalary({ min: 8000, max: 10000, cadence: 'monthly' });
    expect(result.min).toBe(8000);
    expect(result.max).toBe(10000);
    expect(result.cadence).toBe('monthly');
    expect(result.currency).toBe('USD');
  });

  it('returns correct object shape', () => {
    const result = normalizeSalary({ min: 50000, max: 80000, currency: 'GBP' });
    expect(result).toMatchObject<Partial<NormalizedSalary>>({
      min: 50000,
      max: 80000,
      currency: 'GBP',
      cadence: 'yearly',
    });
    expect(result).toHaveProperty('raw');
  });

  it('defaults missing max to min value', () => {
    const result = normalizeSalary({ min: 90000 });
    expect(result.min).toBe(90000);
    expect(result.max).toBe(90000);
  });

  it('swaps min/max if min is larger than max', () => {
    const result = normalizeSalary({ min: 200000, max: 100000 });
    expect(result.min).toBe(100000);
    expect(result.max).toBe(200000);
  });
});

describe('salaryToYearly', () => {
  it('converts monthly salary to yearly by multiplying by 12', () => {
    const monthly: NormalizedSalary = {
      min: 8000,
      max: 10000,
      currency: 'USD',
      cadence: 'monthly',
    };
    const result = salaryToYearly(monthly);
    expect(result.min).toBe(96000);
    expect(result.max).toBe(120000);
  });

  it('returns yearly salary unchanged', () => {
    const yearly: NormalizedSalary = {
      min: 100000,
      max: 150000,
      currency: 'USD',
      cadence: 'yearly',
    };
    const result = salaryToYearly(yearly);
    expect(result.min).toBe(100000);
    expect(result.max).toBe(150000);
  });

  it('converts hourly salary to yearly (×2080)', () => {
    const hourly: NormalizedSalary = {
      min: 50,
      max: 75,
      currency: 'USD',
      cadence: 'hourly',
    };
    const result = salaryToYearly(hourly);
    expect(result.min).toBe(50 * 2080);
    expect(result.max).toBe(75 * 2080);
  });
});
