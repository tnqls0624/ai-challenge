import type { RiskEngineInput } from '@dont-worry/risk-engine';
import type { RiskEventFeaturesDto, RISK_KEYWORD_IDS } from './risk-events.dto';

type ExtractedTextFeatures = {
  impersonatedEntityTypes: RiskEngineInput['features']['impersonatedEntityTypes'];
  riskKeywordIds: Array<(typeof RISK_KEYWORD_IDS)[number]>;
  requestsAppInstall: boolean;
  requestsPayment: boolean;
  requestsRemoteControl: boolean;
  requestsSecret: boolean;
};

export function mergeRiskFeatures(
  submitted: RiskEventFeaturesDto,
  rawText: string | undefined,
): {
  engineFeatures: RiskEngineInput['features'];
  featureSnapshot: Record<string, boolean | number | string[]>;
} {
  const extracted = rawText === undefined ? emptyExtractedFeatures() : extractTextFeatures(rawText);
  const impersonatedEntityTypes = unique([
    ...submitted.impersonatedEntityTypes,
    ...extracted.impersonatedEntityTypes,
  ]);
  const riskKeywordIds = unique([...submitted.riskKeywordIds, ...extracted.riskKeywordIds]);
  const features = {
    contentAvailable: rawText === undefined ? submitted.contentAvailable : true,
    contentTruncated: rawText === undefined ? submitted.contentTruncated : false,
    extractionComplete: rawText === undefined ? submitted.extractionComplete : true,
    hasImpersonationOrPressure:
      impersonatedEntityTypes.length > 0 ||
      riskKeywordIds.some((keyword) =>
        (['URGENCY', 'FEAR', 'SECRECY'] as const).includes(
          keyword as 'URGENCY' | 'FEAR' | 'SECRECY',
        ),
      ),
    hasSecrecyPressure: riskKeywordIds.includes('SECRECY'),
    impersonatedEntityTypes,
    normalizedLength:
      rawText === undefined ? submitted.normalizedLength : normalizeText(rawText).length,
    officialSourceVerified: false,
    phoneReported: false,
    recentSuspiciousEvent: false,
    requestsAppInstall: submitted.requestsAppInstall || extracted.requestsAppInstall,
    requestsPayment: submitted.requestsPayment || extracted.requestsPayment,
    requestsRemoteControl: submitted.requestsRemoteControl || extracted.requestsRemoteControl,
    requestsSecret: submitted.requestsSecret || extracted.requestsSecret,
    userClickedLink: false,
    userConfirmedTransfer: false,
    userEnteredPersonalInformation: false,
    userInstalledApp: false,
  } satisfies RiskEngineInput['features'];

  return {
    engineFeatures: features,
    featureSnapshot: {
      ...features,
      riskKeywordIds,
    },
  };
}

export function extractTextFeatures(rawText: string): ExtractedTextFeatures {
  const text = normalizeText(rawText);
  const requestsPayment =
    /(송금|입금|납부|결제|현금|대출).{0,16}(요청|필요|하세|하세요|해라|하십시오|바랍니다|신청)/u.test(
      text,
    ) || /(계좌|카드).{0,16}(보내|이체|결제|납부)/u.test(text);
  const requestsAppInstall =
    /(앱|어플|애플리케이션|보안 ?프로그램).{0,16}(설치|다운로드)/u.test(text) ||
    /\.(apk)(?:\s|$)/iu.test(text);
  const requestsRemoteControl =
    /(원격 ?제어|화면 ?공유|팀뷰어|애니데스크|퀵서포트|quicksupport|anydesk|teamviewer)/iu.test(
      text,
    );
  const requestsSecret =
    /(인증 ?번호|비밀번호|보안 ?카드|주민 ?등록 ?번호|otp).{0,16}(알려|입력|전달|보내)/iu.test(
      text,
    );

  const impersonatedEntityTypes: ExtractedTextFeatures['impersonatedEntityTypes'] = [];
  if (/(검찰|경찰|수사관|법원)/u.test(text)) {
    impersonatedEntityTypes.push('LAW_ENFORCEMENT');
  }
  if (/(건강보험|국세청|금융감독원|공공기관|정부|구청|시청)/u.test(text)) {
    impersonatedEntityTypes.push('PUBLIC_AGENCY');
  }
  if (/(은행|카드사|저축은행|금융기관)/u.test(text)) {
    impersonatedEntityTypes.push('FINANCIAL_INSTITUTION');
  }
  if (/(엄마|아빠|어머니|아버지|아들|딸|자녀)/u.test(text)) {
    impersonatedEntityTypes.push('FAMILY');
  }
  if (/(택배|배송|우체국)/u.test(text)) {
    impersonatedEntityTypes.push('DELIVERY');
  }

  const riskKeywordIds: ExtractedTextFeatures['riskKeywordIds'] = [];
  if (/(긴급|즉시|당장|오늘까지|지금 바로|시간이 없)/u.test(text)) {
    riskKeywordIds.push('URGENCY');
  }
  if (/(체포|구속|압류|처벌|계정 정지|피해 발생)/u.test(text)) {
    riskKeywordIds.push('FEAR');
  }
  if (/(비밀|아무에게도|말하지 마|보안 유지)/u.test(text)) {
    riskKeywordIds.push('SECRECY');
  }
  if (requestsPayment) riskKeywordIds.push('PAYMENT_REQUEST');
  if (requestsAppInstall) riskKeywordIds.push('APP_INSTALL');
  if (requestsRemoteControl) riskKeywordIds.push('REMOTE_CONTROL');
  if (requestsSecret) riskKeywordIds.push('SECRET_REQUEST');

  return {
    impersonatedEntityTypes: unique(impersonatedEntityTypes),
    riskKeywordIds: unique(riskKeywordIds),
    requestsAppInstall,
    requestsPayment,
    requestsRemoteControl,
    requestsSecret,
  };
}

function emptyExtractedFeatures(): ExtractedTextFeatures {
  return {
    impersonatedEntityTypes: [],
    riskKeywordIds: [],
    requestsAppInstall: false,
    requestsPayment: false,
    requestsRemoteControl: false,
    requestsSecret: false,
  };
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
