import { describe, expect, it } from 'vitest';
import { DEMO_SCENARIOS, evaluateDemoScenario } from './scenarios';

describe('public demo fixtures', () => {
  it('contains the six documented synthetic scenarios', () => {
    expect(DEMO_SCENARIOS).toHaveLength(6);
    expect(new Set(DEMO_SCENARIOS.map((scenario) => scenario.fixtureId)).size).toBe(6);
    expect(DEMO_SCENARIOS.every((scenario) => scenario.sample.startsWith('[합성'))).toBe(true);
  });

  it.each(DEMO_SCENARIOS)('$fixtureId returns the documented level', (scenario) => {
    const decision = evaluateDemoScenario(scenario);

    expect(decision.level).toBe(scenario.expectedLevel);
    expect(decision.policyVersion).toBe(scenario.input.policyVersion);
  });

  it('keeps external-service-looking inputs on reserved domains', () => {
    const samples = DEMO_SCENARIOS.map((scenario) => scenario.sample).join(' ');

    expect(samples).not.toMatch(/https?:\/\//);
    expect(samples).not.toMatch(/\.(?:com|net|org|co\.kr)\b/i);
    expect(samples).toContain('.invalid');
  });
});
