import { describe, expect, it } from 'vitest';
import { evaluateDemoFixtures } from './evaluation';

describe('evaluateDemoFixtures', () => {
  it('reports deterministic smoke-fixture outcomes with explicit denominators', () => {
    const summary = evaluateDemoFixtures();

    expect(summary.total).toBe(6);
    expect(summary.exactMatches).toBe(6);
    expect(summary.riskyRecall).toEqual({ denominator: 4, numerator: 4 });
    expect(summary.falsePositives).toEqual({ denominator: 2, numerator: 0 });
    expect(summary.evidenceCoverage).toEqual({ denominator: 4, numerator: 4 });
    expect(summary.results.every((result) => result.exactMatch)).toBe(true);
  });
});
