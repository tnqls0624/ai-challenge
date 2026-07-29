import { describe, expect, it } from 'vitest';
import {
  evaluateRisk,
  RISK_ENGINE_VERSION,
  RISK_POLICY_VERSION,
  RISK_SCHEMA_VERSION,
  riskLevelForScore,
  type RiskEngineInput,
} from './index';

describe('risk engine package', () => {
  it('exposes a versioned contract', () => {
    expect(RISK_ENGINE_VERSION).toBe('1.1.0');
  });

  it.each([
    [false, false, false, 'SAFE', 0],
    [true, false, false, 'CAUTION', 25],
    [true, true, false, 'CRITICAL', 40],
    [false, false, true, 'HIGH', 35],
  ] as const)(
    'applies grouped scores and forced minimums',
    (requestsPayment, hasImpersonationOrPressure, maliciousUrl, level, score) => {
      const decision = evaluateRisk(
        input({
          features: {
            ...safeFeatures,
            hasImpersonationOrPressure,
            impersonatedEntityTypes: hasImpersonationOrPressure ? ['PUBLIC_AGENCY'] : [],
            requestsPayment,
          },
          urlReputations: maliciousUrl ? ['MALICIOUS'] : [],
        }),
      );

      expect(decision).toMatchObject({ level, score });
    },
  );

  it('uses only the highest score in a signal group', () => {
    const decision = evaluateRisk(
      input({
        features: {
          ...safeFeatures,
          requestsAppInstall: true,
          requestsPayment: true,
          requestsRemoteControl: true,
          requestsSecret: true,
        },
      }),
    );

    expect(decision.score).toBe(25);
    expect(decision.level).toBe('CRITICAL');
    expect(decision.signals).toHaveLength(4);
  });

  it('never turns insufficient or partial evidence into SAFE', () => {
    expect(
      evaluateRisk(
        input({
          features: {
            ...safeFeatures,
            contentAvailable: false,
            normalizedLength: 0,
          },
        }),
      ).level,
    ).toBe('UNKNOWN');
    expect(
      evaluateRisk(
        input({
          reputationComplete: false,
        }),
      ),
    ).toMatchObject({
      completeness: 'FINALIZED_PARTIAL',
      level: 'UNKNOWN',
    });
  });

  it('keeps a local minimum level when the server has fewer signals', () => {
    expect(
      evaluateRisk(
        input({
          features: {
            ...safeFeatures,
            contentAvailable: false,
            normalizedLength: 0,
          },
          localMinimumLevel: 'HIGH',
        }),
      ).level,
    ).toBe('HIGH');
  });

  it.each([
    [0, 'SAFE'],
    [29, 'SAFE'],
    [30, 'CAUTION'],
    [59, 'CAUTION'],
    [60, 'HIGH'],
    [79, 'HIGH'],
    [80, 'CRITICAL'],
    [100, 'CRITICAL'],
  ] as const)('maps boundary score %i to %s', (score, expected) => {
    expect(riskLevelForScore(score)).toBe(expected);
  });

  it('does not treat urgency alone as impersonation for the critical payment rule', () => {
    expect(
      evaluateRisk(
        input({
          features: {
            ...safeFeatures,
            hasImpersonationOrPressure: true,
            requestsPayment: true,
          },
        }),
      ),
    ).toMatchObject({
      level: 'CAUTION',
      score: 40,
    });
  });

  it('forces app-install plus secrecy pressure to CRITICAL', () => {
    expect(
      evaluateRisk(
        input({
          features: {
            ...safeFeatures,
            hasImpersonationOrPressure: true,
            hasSecrecyPressure: true,
            requestsAppInstall: true,
          },
        }),
      ).level,
    ).toBe('CRITICAL');
  });

  it.each([
    ['userClickedLink', 'CAUTION', 'USER_CONFIRMED_LINK_OPENED'],
    ['userEnteredPersonalInformation', 'HIGH', 'USER_CONFIRMED_PERSONAL_INFO'],
    ['userInstalledApp', 'CRITICAL', 'USER_CONFIRMED_APP_INSTALL'],
    ['userConfirmedTransfer', 'CRITICAL', 'USER_CONFIRMED_TRANSFER'],
  ] as const)('maps the confirmed post-call action %s', (feature, level, signalType) => {
    const decision = evaluateRisk(
      input({
        eventType: 'CALL',
        features: {
          ...safeFeatures,
          [feature]: true,
        },
      }),
    );

    expect(decision.level).toBe(level);
    expect(decision.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: signalType })]),
    );
  });

  it('returns UNKNOWN for unsupported schema or policy versions', () => {
    expect(evaluateRisk(input({ schemaVersion: 99 }))).toMatchObject({
      level: 'UNKNOWN',
      score: null,
    });
    expect(evaluateRisk(input({ policyVersion: 'old-policy' }))).toMatchObject({
      level: 'UNKNOWN',
      score: null,
    });
  });
});

const safeFeatures: RiskEngineInput['features'] = {
  contentAvailable: true,
  contentTruncated: false,
  extractionComplete: true,
  hasImpersonationOrPressure: false,
  hasSecrecyPressure: false,
  impersonatedEntityTypes: [],
  normalizedLength: 20,
  officialSourceVerified: false,
  phoneReported: false,
  recentSuspiciousEvent: false,
  requestsAppInstall: false,
  requestsPayment: false,
  requestsRemoteControl: false,
  requestsSecret: false,
  userClickedLink: false,
  userConfirmedTransfer: false,
  userEnteredPersonalInformation: false,
  userInstalledApp: false,
};

function input(overrides: Partial<RiskEngineInput> = {}): RiskEngineInput {
  return {
    eventId: 'event-1',
    eventType: 'MANUAL',
    features: safeFeatures,
    policyVersion: RISK_POLICY_VERSION,
    reputationComplete: true,
    schemaVersion: RISK_SCHEMA_VERSION,
    urlReputations: [],
    ...overrides,
  };
}
