import { DEMO_SCENARIOS, evaluateDemoScenario } from '../scenarios';

const RISKY_LEVELS = new Set(['HIGH', 'CRITICAL']);

export type DemoEvaluationResult = {
  actualLevel: ReturnType<typeof evaluateDemoScenario>['level'];
  exactMatch: boolean;
  expectedLevel: (typeof DEMO_SCENARIOS)[number]['expectedLevel'];
  fixtureId: string;
  score: number | null;
  signalCount: number;
  title: string;
};

export type DemoEvaluationSummary = {
  evidenceCoverage: {
    denominator: number;
    numerator: number;
  };
  exactMatches: number;
  falsePositives: {
    denominator: number;
    numerator: number;
  };
  results: DemoEvaluationResult[];
  riskyRecall: {
    denominator: number;
    numerator: number;
  };
  total: number;
};

export function evaluateDemoFixtures(): DemoEvaluationSummary {
  const results = DEMO_SCENARIOS.map((scenario): DemoEvaluationResult => {
    const decision = evaluateDemoScenario(scenario);
    return {
      actualLevel: decision.level,
      exactMatch: decision.level === scenario.expectedLevel,
      expectedLevel: scenario.expectedLevel,
      fixtureId: scenario.fixtureId,
      score: decision.score,
      signalCount: decision.signals.length,
      title: scenario.title,
    };
  });
  const risky = results.filter((result) => RISKY_LEVELS.has(result.expectedLevel));
  const normal = results.filter((result) => result.expectedLevel === 'SAFE');

  return {
    evidenceCoverage: {
      denominator: risky.length,
      numerator: risky.filter((result) => result.signalCount > 0).length,
    },
    exactMatches: results.filter((result) => result.exactMatch).length,
    falsePositives: {
      denominator: normal.length,
      numerator: normal.filter((result) => result.actualLevel !== 'SAFE').length,
    },
    results,
    riskyRecall: {
      denominator: risky.length,
      numerator: risky.filter((result) => RISKY_LEVELS.has(result.actualLevel)).length,
    },
    total: results.length,
  };
}
