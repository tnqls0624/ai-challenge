import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ExplanationBudgetService } from './explanation-budget.service';

describe('ExplanationBudgetService', () => {
  it('enforces the per-device minute limit', () => {
    const budget = new ExplanationBudgetService(
      new ConfigService({
        LLM_DEVICE_MINUTE_LIMIT: 2,
        LLM_GLOBAL_DAILY_LIMIT: 100,
      }),
    );

    expect(budget.tryConsume('device-1', 60_000)).toBe(true);
    expect(budget.tryConsume('device-1', 60_001)).toBe(true);
    expect(budget.tryConsume('device-1', 60_002)).toBe(false);
    expect(budget.tryConsume('device-1', 120_000)).toBe(true);
  });

  it('enforces the global daily limit across devices', () => {
    const budget = new ExplanationBudgetService(
      new ConfigService({
        LLM_DEVICE_MINUTE_LIMIT: 10,
        LLM_GLOBAL_DAILY_LIMIT: 2,
      }),
    );

    expect(budget.tryConsume('device-1', 1)).toBe(true);
    expect(budget.tryConsume('device-2', 2)).toBe(true);
    expect(budget.tryConsume('device-3', 3)).toBe(false);
    expect(budget.tryConsume('device-3', 24 * 60 * 60 * 1_000)).toBe(true);
  });
});
