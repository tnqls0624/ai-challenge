import {
  RISK_POLICY_VERSION,
  RISK_SCHEMA_VERSION,
  evaluateRisk,
  type RiskEngineInput,
} from '@dont-worry/risk-engine';

export type DemoStage = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';

export type DemoScenario = {
  actions: string[];
  description: string;
  expectedLevel: ReturnType<typeof evaluateRisk>['level'];
  fixtureId: string;
  id: string;
  input: RiskEngineInput;
  mockNotification: string;
  sample: string;
  stage: DemoStage;
  title: string;
  value: string;
};

const BASE_FEATURES: RiskEngineInput['features'] = {
  contentAvailable: true,
  contentTruncated: false,
  extractionComplete: true,
  hasImpersonationOrPressure: false,
  hasSecrecyPressure: false,
  impersonatedEntityTypes: [],
  normalizedLength: 24,
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

function input(
  eventId: string,
  eventType: RiskEngineInput['eventType'],
  featureOverrides: Partial<RiskEngineInput['features']> = {},
  urlReputations: RiskEngineInput['urlReputations'] = [],
): RiskEngineInput {
  return {
    eventId,
    eventType,
    features: {
      ...BASE_FEATURES,
      ...featureOverrides,
    },
    policyVersion: RISK_POLICY_VERSION,
    reputationComplete: true,
    schemaVersion: RISK_SCHEMA_VERSION,
    urlReputations,
  };
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    actions: ['안내 내용을 천천히 확인하기', '의심되면 배송사 공식 앱에서 다시 확인하기'],
    description: '정상적인 일상 문자를 과도하게 경고하지 않는지 확인합니다.',
    expectedLevel: 'SAFE',
    fixtureId: 'SCN-001',
    id: 'normal-delivery',
    input: input('demo-normal-delivery', 'SMS', { normalizedLength: 31 }),
    mockNotification: '보호자 알림 없음 · 위험 사건이 생성되지 않았습니다.',
    sample: '[합성] 주문하신 생활용품이 문 앞에 배송 완료되었습니다.',
    stage: 'S0',
    title: '정상 택배',
    value: '오탐 억제',
  },
  {
    actions: [
      '통화와 송금을 즉시 중단하기',
      '건강보험공단 공식 대표번호로 직접 확인하기',
      '보호자에게 상황 알리기',
    ],
    description: '기관 사칭과 송금 요구가 결합되면 강제 규칙이 작동합니다.',
    expectedLevel: 'CRITICAL',
    fixtureId: 'SCN-024',
    id: 'health-insurance',
    input: input('demo-health-insurance', 'SMS', {
      hasImpersonationOrPressure: true,
      impersonatedEntityTypes: ['PUBLIC_AGENCY'],
      normalizedLength: 54,
      requestsPayment: true,
    }),
    mockNotification: '매우 위험 · 공공기관 사칭과 금전 요구 신호가 확인되었습니다.',
    sample: '[합성] 건강보험 미납으로 계좌가 정지됩니다. 지금 안내한 곳으로 납부하세요.',
    stage: 'S0',
    title: '건강보험 사칭',
    value: '강제 규칙',
  },
  {
    actions: ['링크를 열지 않기', '결제를 중단하기', '카드사 공식 앱이나 대표번호로 확인하기'],
    description: '고정된 악성 URL 평판과 결제 요구를 함께 판정합니다.',
    expectedLevel: 'CRITICAL',
    fixtureId: 'SCN-029',
    id: 'card-delivery',
    input: input(
      'demo-card-delivery',
      'SMS',
      {
        hasImpersonationOrPressure: true,
        impersonatedEntityTypes: ['FINANCIAL_INSTITUTION'],
        normalizedLength: 62,
        requestsPayment: true,
      },
      ['MALICIOUS'],
    ),
    mockNotification: '매우 위험 · 악성 링크와 결제 요구가 함께 확인되었습니다.',
    sample:
      '[합성] 신청하지 않은 카드가 배송 중입니다. card-check.invalid에서 취소 비용을 결제하세요.',
    stage: 'S0',
    title: '카드 배송 사칭',
    value: 'URL 평판',
  },
  {
    actions: [
      '통화를 종료하기',
      '송금하지 않기',
      '검찰청 공식 대표번호로 사실 확인하기',
      '보호자와 함께 확인하기',
    ],
    description: '의심 문자 뒤의 전화와 통화 후 행동 응답을 하나의 사건으로 봅니다.',
    expectedLevel: 'CRITICAL',
    fixtureId: 'SCN-025',
    id: 'prosecution-call',
    input: input('demo-prosecution-call', 'CALL', {
      contentAvailable: false,
      extractionComplete: false,
      hasImpersonationOrPressure: true,
      impersonatedEntityTypes: ['LAW_ENFORCEMENT'],
      normalizedLength: 0,
      phoneReported: true,
      recentSuspiciousEvent: true,
      requestsPayment: true,
    }),
    mockNotification: '매우 위험 · 의심 문자에 이어 검찰 사칭 전화와 송금 요구가 확인되었습니다.',
    sample: '[합성 전화] 검찰을 사칭해 “안전 계좌” 송금을 요구한 통화 후 설문',
    stage: 'S0',
    title: '검찰 사칭 전화',
    value: '문자–전화 연결',
  },
  {
    actions: ['예약 정보를 확인하기', '개인정보 요청이 생기면 병원 공식번호로 다시 전화하기'],
    description: '공식 출처로 검증된 정상 전화를 위험으로 단정하지 않습니다.',
    expectedLevel: 'SAFE',
    fixtureId: 'SCN-003',
    id: 'normal-hospital',
    input: input('demo-normal-hospital', 'CALL', {
      contentAvailable: false,
      extractionComplete: false,
      normalizedLength: 0,
      officialSourceVerified: true,
    }),
    mockNotification: '보호자 알림 없음 · 공식 출처로 확인된 정상 전화입니다.',
    sample: '[합성 전화] 내일 오전 10시 정기 진료 예약 확인 전화',
    stage: 'S0',
    title: '정상 병원 전화',
    value: '정상 전화',
  },
  {
    actions: ['즉시 112에 신고하기', '은행에 지급정지를 요청하기', '문자·통화·이체 증거 보존하기'],
    description: '이미 송금했다고 확인되면 S4 긴급 대응으로 바로 전환합니다.',
    expectedLevel: 'CRITICAL',
    fixtureId: 'SCN-028',
    id: 'loss-confirmed',
    input: input('demo-loss-confirmed', 'CALL', {
      contentAvailable: false,
      extractionComplete: false,
      normalizedLength: 0,
      userConfirmedTransfer: true,
    }),
    mockNotification: '긴급 대응 · 송금 피해가 확인되어 112와 은행 연락이 필요합니다.',
    sample: '[합성 설문] “상대방 안내에 따라 이미 송금했습니다”에 체크',
    stage: 'S4',
    title: '피해 발생',
    value: 'S4 공동대응',
  },
] as const;

export function evaluateDemoScenario(scenario: DemoScenario) {
  return evaluateRisk(scenario.input);
}

export function findDemoScenario(id: string): DemoScenario {
  return DEMO_SCENARIOS.find((scenario) => scenario.id === id) ?? DEMO_SCENARIOS[0]!;
}
