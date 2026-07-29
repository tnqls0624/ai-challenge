import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RiskDecision } from '@dont-worry/contracts';
import { ExplanationSource, IncidentStage } from '../generated/prisma/client';
import {
  EXPLANATION_PROVIDER,
  type ExplanationInput,
  type ExplanationProvider,
  type ProviderExplanation,
} from './explanation.provider';
import { ExplanationBudgetService } from './explanation-budget.service';

export type SafeExplanation = Pick<ProviderExplanation, 'body' | 'incidentSummary' | 'title'> & {
  source: ExplanationSource;
};

const LEVEL_TITLES: Record<RiskDecision['level'], string> = {
  CAUTION: '주의해서 확인해 주세요',
  CRITICAL: '매우 위험한 신호가 확인됐습니다',
  HIGH: '위험한 신호가 확인됐습니다',
  SAFE: '확인된 위험 신호가 없습니다',
  UNKNOWN: '지금은 판단할 정보가 부족합니다',
};
const EXPLANATION_TIMEOUT_MS = 1_500;
const EXPLANATION_CACHE_TTL_MS = 10 * 60 * 1_000;
const EXPLANATION_CACHE_MAX_ENTRIES = 256;

const ACTION_COPY: Record<string, string> = {
  CALL_112: '즉시 112와 은행에 연락해 주세요.',
  CALL_112_AND_BANK: '즉시 112와 은행에 연락해 주세요.',
  CHANGE_CREDENTIALS: '안전한 다른 기기에서 비밀번호를 바꿔 주세요.',
  CHECK_ACCOUNTS: '계정과 금융 거래 내역을 확인해 주세요.',
  CLOSE_LINK: '열어 둔 링크와 브라우저를 닫아 주세요.',
  CONTACT_FINANCIAL_INSTITUTION: '금융기관에 개인정보 노출 가능성을 알려 주세요.',
  CONTACT_GUARDIAN: '보호자와 상황을 함께 확인해 주세요.',
  CONTINUE_WITH_NORMAL_CAUTION: '평소처럼 주의하며 내용을 확인해 주세요.',
  DISCONNECT_NETWORK: '휴대전화의 Wi-Fi와 모바일 데이터를 꺼 주세요.',
  DO_NOT_INSTALL: '파일이나 앱을 더 설치하지 마세요.',
  DO_NOT_INSTALL_APP: '파일이나 앱을 더 설치하지 마세요.',
  PRESERVE_EVIDENCE: '문자·통화·이체 증거를 삭제하지 마세요.',
  REQUEST_PAYMENT_STOP: '은행에 지급정지를 요청해 주세요.',
  REQUEST_GUARDIAN_REVIEW: '보호자와 상황을 함께 확인해 주세요.',
  SEEK_MALWARE_HELP: '공식 기관의 악성 앱 점검 도움을 받아 주세요.',
  STOP_CONTACT: '링크와 통화를 즉시 중단해 주세요.',
  STOP_CURRENT_ACTION: '지금 하던 행동을 즉시 멈춰 주세요.',
  VERIFY_OFFICIAL_CHANNEL: '메시지에 적힌 연락처가 아닌 공식 대표번호로 확인해 주세요.',
};

@Injectable()
export class ExplanationService {
  private readonly cache = new Map<string, { expiresAt: number; value: SafeExplanation }>();

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(EXPLANATION_PROVIDER) private readonly provider: ExplanationProvider,
    @Inject(ExplanationBudgetService)
    private readonly budget: ExplanationBudgetService,
  ) {}

  async explain(
    decision: RiskDecision,
    incidentStage: IncidentStage = IncidentStage.S0,
    budgetScope = 'unscoped',
  ): Promise<SafeExplanation> {
    const input = toProviderInput(decision, incidentStage);
    const fallback = templateExplanation(input);
    if (this.config.get<string>('LLM_PROVIDER') !== 'openai') {
      return fallback;
    }
    const cacheKey = JSON.stringify(input);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    if (cached !== undefined) {
      this.cache.delete(cacheKey);
    }
    if (!this.budget.tryConsume(budgetScope)) {
      return fallback;
    }
    try {
      const candidate = await withTimeout(this.provider.explain(input), EXPLANATION_TIMEOUT_MS);
      if (!validateCandidate(candidate, input)) {
        return fallback;
      }
      const explanation = {
        body: candidate.body,
        incidentSummary: candidate.incidentSummary,
        source: ExplanationSource.OPENAI,
        title: candidate.title,
      };
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + EXPLANATION_CACHE_TTL_MS,
        value: explanation,
      });
      this.pruneCache();
      return explanation;
    } catch {
      return fallback;
    }
  }

  private pruneCache(): void {
    if (this.cache.size <= EXPLANATION_CACHE_MAX_ENTRIES) return;
    const firstKey = this.cache.keys().next().value as string | undefined;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Explanation provider timed out')),
      timeoutMs,
    );
    void promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Explanation provider failed'));
      },
    );
  });
}

export function templateExplanation(input: ExplanationInput): SafeExplanation {
  const evidence = input.signals[0]?.evidence;
  const action =
    input.recommendedActionIds
      .map((actionId) => ACTION_COPY[actionId])
      .find((copy) => copy !== undefined) ?? '보호자 또는 공식 기관과 함께 확인해 주세요.';
  const reason =
    evidence ??
    (input.level === 'UNKNOWN'
      ? '확인할 수 있는 내용이 충분하지 않습니다.'
      : input.level === 'SAFE'
        ? '현재 입력에서 확인된 위험 근거가 없습니다.'
        : '주의가 필요한 행동 신호가 확인되었습니다.');
  return {
    body: `${reason} ${action}`,
    incidentSummary: `${stageLabel(input.incidentStage)} 단계입니다. ${reason} ${action}`,
    source: ExplanationSource.TEMPLATE,
    title: LEVEL_TITLES[input.level],
  };
}

function toProviderInput(decision: RiskDecision, incidentStage: IncidentStage): ExplanationInput {
  return {
    category: decision.category,
    incidentStage,
    level: decision.level,
    recommendedActionIds: [...decision.recommendedActionIds],
    signals: decision.signals.map(({ evidence, type }) => ({ evidence, type })),
  };
}

function validateCandidate(candidate: ProviderExplanation, input: ExplanationInput): boolean {
  const fields = [candidate.title.trim(), candidate.body.trim(), candidate.incidentSummary.trim()];
  if (fields.some((field) => field.length === 0)) return false;
  if (
    candidate.title.length > 80 ||
    candidate.body.length > 300 ||
    candidate.incidentSummary.length > 400
  ) {
    return false;
  }
  const combined = fields.join(' ');
  if (/(?:https?:\/\/|www\.|[A-Za-z0-9-]+\.[A-Za-z]{2,}\b)/i.test(combined)) {
    return false;
  }
  if (/\d(?:[\s-]?\d){5,}/.test(combined)) return false;
  if (input.level !== 'SAFE' && /안전(?:합니다|해요|한 메시지)/.test(combined)) return false;
  if (input.level === 'SAFE' && /(매우 위험|즉시 신고|피해가 발생)/.test(combined)) return false;
  if (!validGroundingReferences(candidate, input)) return false;
  return groundedInKnownSignals(combined, input);
}

function validGroundingReferences(
  candidate: ProviderExplanation,
  input: ExplanationInput,
): boolean {
  const signalTypes = new Set<string>(input.signals.map((signal) => signal.type));
  const actionIds = new Set(input.recommendedActionIds);
  if (input.signals.length > 0 && candidate.groundingSignalTypes.length === 0) return false;
  if (candidate.groundingSignalTypes.some((signalType) => !signalTypes.has(signalType))) {
    return false;
  }
  if (input.recommendedActionIds.length > 0 && candidate.groundingActionIds.length === 0) {
    return false;
  }
  return candidate.groundingActionIds.every((actionId) => actionIds.has(actionId));
}

function groundedInKnownSignals(text: string, input: ExplanationInput): boolean {
  const signalTypes = new Set(input.signals.map((signal) => signal.type));
  const claims: Array<{
    pattern: RegExp;
    types: Array<ExplanationInput['signals'][number]['type']>;
  }> = [
    {
      pattern: /(악성|의심|단축).{0,8}(?:링크|URL|주소)/,
      types: ['SHORTENED_URL', 'SUSPICIOUS_DOMAIN', 'VERIFIED_MALICIOUS_URL'],
    },
    { pattern: /송금\s*(?:했|완료|피해)/, types: ['USER_CONFIRMED_TRANSFER'] },
    { pattern: /앱을 설치(?:했|한 상태)/, types: ['USER_CONFIRMED_APP_INSTALL'] },
    {
      pattern: /(?:개인정보|인증정보).{0,6}(?:입력했|넘겼|노출됐)/,
      types: ['USER_CONFIRMED_PERSONAL_INFO'],
    },
    { pattern: /송금.{0,6}(?:요구|요청)/, types: ['PAYMENT_REQUEST'] },
    { pattern: /앱.{0,8}설치.{0,6}(?:요구|요청)/, types: ['APP_INSTALL_REQUEST'] },
    { pattern: /원격.{0,4}제어.{0,6}(?:요구|요청)/, types: ['REMOTE_CONTROL_REQUEST'] },
    { pattern: /(?:비밀번호|인증번호).{0,6}(?:요구|요청)/, types: ['SECRET_REQUEST'] },
    { pattern: /기관.{0,5}사칭/, types: ['IMPERSONATION_OR_PRESSURE'] },
    { pattern: /신고.{0,5}(?:전화|번호)/, types: ['REPORTED_PHONE'] },
    { pattern: /최근.{0,8}(?:문자|의심).{0,8}전화/, types: ['RECENT_SUSPICIOUS_EVENT'] },
  ];
  return claims.every(
    ({ pattern, types }) =>
      !pattern.test(text) || types.some((signalType) => signalTypes.has(signalType)),
  );
}

function stageLabel(stage: IncidentStage): string {
  return {
    S0: '접촉만 확인된',
    S1: '링크를 연',
    S2: '정보를 입력한',
    S3: '앱을 설치한',
    S4: '금전 피해가 발생한',
  }[stage];
}
