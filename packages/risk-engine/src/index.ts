import type {
  AnalysisCompleteness,
  RiskCategory,
  RiskDecision,
  RiskEventType,
  RiskLevel,
  RiskSignal,
} from '@dont-worry/contracts';

export const RISK_ENGINE_VERSION = '1.1.0';
export const RISK_POLICY_VERSION = '2026-07-28.1';
export const RISK_SCHEMA_VERSION = 1;

export type UrlReputation = 'CLEAR' | 'MALICIOUS' | 'SHORTENED' | 'SUSPICIOUS' | 'UNAVAILABLE';

export type RiskEngineInput = {
  eventId: string;
  eventType: RiskEventType;
  features: {
    contentAvailable: boolean;
    contentTruncated: boolean;
    extractionComplete: boolean;
    hasImpersonationOrPressure: boolean;
    hasSecrecyPressure: boolean;
    impersonatedEntityTypes: Array<
      'DELIVERY' | 'FAMILY' | 'FINANCIAL_INSTITUTION' | 'LAW_ENFORCEMENT' | 'PUBLIC_AGENCY'
    >;
    normalizedLength: number;
    officialSourceVerified: boolean;
    phoneReported: boolean;
    recentSuspiciousEvent: boolean;
    requestsAppInstall: boolean;
    requestsPayment: boolean;
    requestsRemoteControl: boolean;
    requestsSecret: boolean;
    userClickedLink: boolean;
    userConfirmedTransfer: boolean;
    userEnteredPersonalInformation: boolean;
    userInstalledApp: boolean;
  };
  localMinimumLevel?: Exclude<RiskLevel, 'UNKNOWN'>;
  policyVersion: string;
  reputationComplete: boolean;
  schemaVersion: number;
  urlReputations: UrlReputation[];
};

const LEVEL_ORDER: Record<RiskLevel, number> = {
  UNKNOWN: -1,
  SAFE: 0,
  CAUTION: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const LEVEL_BY_SCORE: Array<{ minimum: number; level: Exclude<RiskLevel, 'UNKNOWN'> }> = [
  { minimum: 80, level: 'CRITICAL' },
  { minimum: 60, level: 'HIGH' },
  { minimum: 30, level: 'CAUTION' },
  { minimum: 0, level: 'SAFE' },
];

export function evaluateRisk(input: RiskEngineInput): RiskDecision {
  const completeness = resolveCompleteness(input);
  if (input.schemaVersion !== RISK_SCHEMA_VERSION || input.policyVersion !== RISK_POLICY_VERSION) {
    return unknownDecision(input, completeness);
  }

  const signals = collectSignals(input);
  const score = Math.min(
    100,
    [...groupSignals(signals).values()].reduce((total, signal) => total + signal.score, 0),
  );
  const minimumLevel = resolveForcedMinimum(input, signals);
  const sufficientForSafe = hasSufficientSafeEvidence(input);

  let level: RiskLevel;
  if (signals.length === 0 && !sufficientForSafe && input.localMinimumLevel === undefined) {
    level = 'UNKNOWN';
  } else {
    level = riskLevelForScore(score);
    level = maxLevel(level, minimumLevel);
    if (input.localMinimumLevel !== undefined) {
      level = maxLevel(level, input.localMinimumLevel);
    }
    if (completeness === 'FINALIZED_PARTIAL' && level === 'SAFE') {
      level = 'UNKNOWN';
    }
  }

  return {
    category: inferCategory(input, signals),
    completeness,
    confidence: resolveConfidence(level, completeness, signals, sufficientForSafe),
    eventId: input.eventId,
    level,
    policyVersion: RISK_POLICY_VERSION,
    recommendedActionIds: recommendedActions(level, signals),
    score: level === 'UNKNOWN' && signals.length === 0 ? null : score,
    signals,
  };
}

function collectSignals(input: RiskEngineInput): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const reputations = new Set(input.urlReputations);

  if (reputations.has('MALICIOUS')) {
    signals.push({
      evidence: '검증된 악성 URL과 일치합니다.',
      group: 'URL_REPUTATION',
      score: 35,
      source: 'KISA',
      type: 'VERIFIED_MALICIOUS_URL',
    });
  } else if (reputations.has('SUSPICIOUS')) {
    signals.push({
      evidence: '공식 주소와 혼동하기 쉬운 의심 도메인입니다.',
      group: 'URL_REPUTATION',
      score: 20,
      source: 'RULE',
      type: 'SUSPICIOUS_DOMAIN',
    });
  } else if (reputations.has('SHORTENED')) {
    signals.push({
      evidence: '목적지를 바로 확인하기 어려운 단축 URL입니다.',
      group: 'URL_REPUTATION',
      score: 10,
      source: 'RULE',
      type: 'SHORTENED_URL',
    });
  }

  if (input.features.requestsSecret) {
    signals.push({
      evidence: '인증번호·비밀번호 등 비밀정보 전달을 요구합니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'RULE',
      type: 'SECRET_REQUEST',
    });
  }
  if (input.features.requestsPayment) {
    signals.push({
      evidence: '송금·결제·대출 등 금전 행동을 요구합니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'RULE',
      type: 'PAYMENT_REQUEST',
    });
  }
  if (input.features.requestsAppInstall) {
    signals.push({
      evidence: '출처를 확인하기 어려운 앱 설치를 요구합니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'RULE',
      type: 'APP_INSTALL_REQUEST',
    });
  }
  if (input.features.requestsRemoteControl) {
    signals.push({
      evidence: '기기 원격 제어를 요구합니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'RULE',
      type: 'REMOTE_CONTROL_REQUEST',
    });
  }
  if (input.features.hasImpersonationOrPressure) {
    signals.push({
      evidence: '기관·가족 사칭 또는 긴급한 행동 압박 표현이 있습니다.',
      group: 'IMPERSONATION_PRESSURE',
      score: 15,
      source: 'RULE',
      type: 'IMPERSONATION_OR_PRESSURE',
    });
  }
  if (input.features.phoneReported) {
    signals.push({
      evidence: '검수된 신고 전화번호와 일치합니다.',
      group: 'PHONE_REPUTATION',
      score: 15,
      source: 'PHONE_REPUTATION',
      type: 'REPORTED_PHONE',
    });
  }
  if (input.features.recentSuspiciousEvent) {
    signals.push({
      evidence: '최근 의심 문자 뒤에 이어진 전화입니다.',
      group: 'CORRELATION',
      score: 10,
      source: 'CORRELATION',
      type: 'RECENT_SUSPICIOUS_EVENT',
    });
  }
  if (input.features.userConfirmedTransfer) {
    signals.push({
      evidence: '사용자가 이미 송금했다고 확인했습니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'USER',
      type: 'USER_CONFIRMED_TRANSFER',
    });
  }
  if (input.features.userInstalledApp) {
    signals.push({
      evidence: '사용자가 상대방의 안내에 따라 앱을 설치했다고 확인했습니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'USER',
      type: 'USER_CONFIRMED_APP_INSTALL',
    });
  }
  if (input.features.userEnteredPersonalInformation) {
    signals.push({
      evidence: '사용자가 개인정보나 인증정보를 입력했다고 확인했습니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'USER',
      type: 'USER_CONFIRMED_PERSONAL_INFO',
    });
  }
  if (input.features.userClickedLink) {
    signals.push({
      evidence: '사용자가 상대방이 보낸 링크를 열었다고 확인했습니다.',
      group: 'RISKY_ACTION',
      score: 10,
      source: 'USER',
      type: 'USER_CONFIRMED_LINK_OPENED',
    });
  }

  return signals;
}

function groupSignals(signals: RiskSignal[]): Map<RiskSignal['group'], RiskSignal> {
  const groups = new Map<RiskSignal['group'], RiskSignal>();
  for (const signal of signals) {
    const existing = groups.get(signal.group);
    if (existing === undefined || signal.score > existing.score) {
      groups.set(signal.group, signal);
    }
  }
  return groups;
}

function resolveForcedMinimum(input: RiskEngineInput, signals: RiskSignal[]): RiskLevel {
  if (input.features.userConfirmedTransfer) {
    return 'CRITICAL';
  }
  if (input.features.userInstalledApp) {
    return 'CRITICAL';
  }
  if (input.features.userEnteredPersonalInformation) {
    return 'HIGH';
  }
  if (input.features.requestsPayment && input.features.impersonatedEntityTypes.length > 0) {
    return 'CRITICAL';
  }
  if (
    input.features.requestsAppInstall &&
    (input.features.requestsRemoteControl || input.features.hasSecrecyPressure)
  ) {
    return 'CRITICAL';
  }
  if (
    input.features.requestsSecret ||
    signals.some((signal) => signal.type === 'VERIFIED_MALICIOUS_URL')
  ) {
    return 'HIGH';
  }
  if (input.features.userClickedLink) {
    return 'CAUTION';
  }
  if (signals.length > 0) {
    return 'CAUTION';
  }
  return 'SAFE';
}

function hasSufficientSafeEvidence(input: RiskEngineInput): boolean {
  if (input.eventType === 'CALL') {
    return input.features.officialSourceVerified;
  }
  if (input.eventType === 'URL') {
    return (
      input.urlReputations.length > 0 &&
      input.reputationComplete &&
      input.urlReputations.every((reputation) => reputation === 'CLEAR')
    );
  }
  return (
    input.features.contentAvailable &&
    input.features.extractionComplete &&
    !input.features.contentTruncated &&
    input.features.normalizedLength >= 8 &&
    (input.urlReputations.length === 0 ||
      (input.reputationComplete &&
        input.urlReputations.every((reputation) => reputation === 'CLEAR')))
  );
}

function resolveCompleteness(input: RiskEngineInput): AnalysisCompleteness {
  return input.reputationComplete ? 'FINAL' : 'FINALIZED_PARTIAL';
}

export function riskLevelForScore(score: number): Exclude<RiskLevel, 'UNKNOWN'> {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError('Risk score must be between 0 and 100');
  }
  return LEVEL_BY_SCORE.find(({ minimum }) => score >= minimum)?.level ?? 'SAFE';
}

function maxLevel(left: RiskLevel, right: RiskLevel): RiskLevel {
  return LEVEL_ORDER[left] >= LEVEL_ORDER[right] ? left : right;
}

function resolveConfidence(
  level: RiskLevel,
  completeness: AnalysisCompleteness,
  signals: RiskSignal[],
  sufficientForSafe: boolean,
): RiskDecision['confidence'] {
  if (level === 'UNKNOWN' || completeness === 'FINALIZED_PARTIAL') {
    return 'LOW';
  }
  if (
    sufficientForSafe ||
    signals.some(
      (signal) =>
        signal.type === 'VERIFIED_MALICIOUS_URL' ||
        signal.type === 'USER_CONFIRMED_APP_INSTALL' ||
        signal.type === 'USER_CONFIRMED_PERSONAL_INFO' ||
        signal.type === 'USER_CONFIRMED_TRANSFER',
    )
  ) {
    return 'HIGH';
  }
  return 'MEDIUM';
}

function inferCategory(input: RiskEngineInput, signals: RiskSignal[]): RiskCategory {
  if (
    input.features.impersonatedEntityTypes.includes('PUBLIC_AGENCY') ||
    input.features.impersonatedEntityTypes.includes('LAW_ENFORCEMENT')
  ) {
    return 'GOVERNMENT_IMPERSONATION';
  }
  if (input.features.impersonatedEntityTypes.includes('FAMILY')) {
    return 'FAMILY_IMPERSONATION';
  }
  if (input.features.requestsSecret || input.features.userEnteredPersonalInformation) {
    return 'CREDENTIAL_THEFT';
  }
  if (
    input.features.requestsAppInstall ||
    input.features.requestsRemoteControl ||
    input.features.userInstalledApp
  ) {
    return 'MALWARE_INSTALLATION';
  }
  if (
    input.features.requestsPayment ||
    input.features.userConfirmedTransfer ||
    signals.some((signal) => signal.type === 'VERIFIED_MALICIOUS_URL')
  ) {
    return 'FINANCIAL_FRAUD';
  }
  return 'UNCLASSIFIED';
}

function recommendedActions(level: RiskLevel, signals: RiskSignal[]): string[] {
  if (level === 'UNKNOWN') {
    return ['VERIFY_OFFICIAL_CHANNEL', 'REQUEST_GUARDIAN_REVIEW'];
  }
  if (level === 'SAFE') {
    return ['CONTINUE_WITH_NORMAL_CAUTION'];
  }

  const actions = ['STOP_CURRENT_ACTION', 'VERIFY_OFFICIAL_CHANNEL'];
  if (
    signals.some(
      (signal) =>
        signal.type === 'APP_INSTALL_REQUEST' ||
        signal.type === 'REMOTE_CONTROL_REQUEST' ||
        signal.type === 'USER_CONFIRMED_APP_INSTALL',
    )
  ) {
    actions.push('DO_NOT_INSTALL_APP');
  }
  if (level === 'HIGH' || level === 'CRITICAL') {
    actions.push('REQUEST_GUARDIAN_REVIEW');
  }
  if (signals.some((signal) => signal.type === 'USER_CONFIRMED_TRANSFER')) {
    actions.push('CALL_112_AND_BANK');
  }
  return actions.slice(0, 4);
}

function unknownDecision(input: RiskEngineInput, completeness: AnalysisCompleteness): RiskDecision {
  return {
    category: 'UNCLASSIFIED',
    completeness,
    confidence: 'LOW',
    eventId: input.eventId,
    level: 'UNKNOWN',
    policyVersion: RISK_POLICY_VERSION,
    recommendedActionIds: ['VERIFY_OFFICIAL_CHANNEL', 'REQUEST_GUARDIAN_REVIEW'],
    score: null,
    signals: [],
  };
}
