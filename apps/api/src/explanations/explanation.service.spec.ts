import type { RiskDecision } from '@dont-worry/contracts';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExplanationSource, IncidentStage } from '../generated/prisma/client';
import type {
  ExplanationInput,
  ExplanationProvider,
  ProviderExplanation,
} from './explanation.provider';
import { ExplanationBudgetService } from './explanation-budget.service';
import { ExplanationService } from './explanation.service';

const decision: RiskDecision = {
  category: 'FINANCIAL_FRAUD',
  completeness: 'FINAL',
  confidence: 'HIGH',
  eventId: 'event-1',
  level: 'CRITICAL',
  policyVersion: '2026-07-28.1',
  recommendedActionIds: ['STOP_CURRENT_ACTION', 'REQUEST_GUARDIAN_REVIEW'],
  score: 80,
  signals: [
    {
      evidence: '송금·결제·대출 등 금전 행동을 요구합니다.',
      group: 'RISKY_ACTION',
      score: 25,
      source: 'RULE',
      type: 'PAYMENT_REQUEST',
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('ExplanationService', () => {
  it('uses a deterministic template without calling the provider by default', async () => {
    const provider = fakeProvider();
    const service = makeService({ LLM_PROVIDER: 'template' }, provider);

    const result = await service.explain(decision);

    expect(result).toMatchObject({
      source: ExplanationSource.TEMPLATE,
      title: '매우 위험한 신호가 확인됐습니다',
    });
    expect(result.body).toContain('금전 행동을 요구합니다');
    expect(provider.explain).not.toHaveBeenCalled();
  });

  it('sends only finalized decision fields and accepts grounded structured output', async () => {
    let received: ExplanationInput | undefined;
    const provider: ExplanationProvider = {
      explain: vi.fn(async (input: ExplanationInput) => {
        received = input;
        return {
          body: '금전 행동을 요구한 신호가 있습니다. 통화를 중단해 주세요.',
          groundingActionIds: ['STOP_CURRENT_ACTION'],
          groundingSignalTypes: ['PAYMENT_REQUEST'],
          incidentSummary: '접촉 단계이며 금전 행동 요구 신호가 확인되었습니다.',
          title: '매우 위험한 신호가 있습니다',
        };
      }),
    };
    const service = makeService({ LLM_PROVIDER: 'openai' }, provider);

    const result = await service.explain(decision, IncidentStage.S0);

    expect(result.source).toBe(ExplanationSource.OPENAI);
    expect(received).toEqual({
      category: decision.category,
      incidentStage: IncidentStage.S0,
      level: decision.level,
      recommendedActionIds: decision.recommendedActionIds,
      signals: [
        {
          evidence: decision.signals[0]?.evidence,
          type: decision.signals[0]?.type,
        },
      ],
    });
    expect(received).not.toHaveProperty('rawText');
    expect(received).not.toHaveProperty('sender');
    expect(received).not.toHaveProperty('urls');
  });

  it('falls back when output contains an invented URL or unsupported damage claim', async () => {
    const provider = fakeProvider({
      body: 'evil.example 링크로 이미 송금 피해가 발생했습니다.',
      groundingActionIds: ['STOP_CURRENT_ACTION'],
      groundingSignalTypes: ['PAYMENT_REQUEST'],
      incidentSummary: '송금 피해가 발생했습니다.',
      title: '피해 확정',
    });
    const service = makeService({ LLM_PROVIDER: 'openai' }, provider);

    await expect(service.explain(decision)).resolves.toMatchObject({
      source: ExplanationSource.TEMPLATE,
    });
  });

  it('falls back when grounding IDs are not a subset of the decision', async () => {
    const provider = fakeProvider({
      body: '금전 행동 요구 신호가 있어 지금 행동을 멈춰야 합니다.',
      groundingActionIds: ['CALL_112_AND_BANK'],
      groundingSignalTypes: ['SECRET_REQUEST'],
      incidentSummary: '금전 행동 요구 신호를 보호자가 확인해야 합니다.',
      title: '위험 신호가 있습니다',
    });
    const service = makeService({ LLM_PROVIDER: 'openai' }, provider);

    await expect(service.explain(decision)).resolves.toMatchObject({
      source: ExplanationSource.TEMPLATE,
    });
  });

  it('falls back after the provider timeout', async () => {
    vi.useFakeTimers();
    const provider: ExplanationProvider = {
      explain: vi.fn(() => new Promise<ProviderExplanation>(() => undefined)),
    };
    const service = makeService({ LLM_PROVIDER: 'openai' }, provider);

    const pending = service.explain(decision);
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(pending).resolves.toMatchObject({
      source: ExplanationSource.TEMPLATE,
    });
  });

  it('reuses a validated explanation for the same bounded decision input', async () => {
    const provider = fakeProvider({
      body: '금전 행동 요구 신호가 있어 지금 행동을 멈춰야 합니다.',
      groundingActionIds: ['STOP_CURRENT_ACTION'],
      groundingSignalTypes: ['PAYMENT_REQUEST'],
      incidentSummary: '금전 행동 요구 신호를 보호자가 확인해야 합니다.',
      title: '위험 신호가 있습니다',
    });
    const service = makeService({ LLM_PROVIDER: 'openai' }, provider);

    const first = await service.explain(decision, IncidentStage.S0, 'device-1');
    const second = await service.explain(decision, IncidentStage.S0, 'device-2');

    expect(first.source).toBe(ExplanationSource.OPENAI);
    expect(second).toEqual(first);
    expect(provider.explain).toHaveBeenCalledTimes(1);
  });
});

function makeService(
  configuration: Record<string, unknown>,
  provider: ExplanationProvider,
): ExplanationService {
  const config = new ConfigService(configuration);
  return new ExplanationService(config, provider, new ExplanationBudgetService(config));
}

function fakeProvider(
  result = {
    body: '근거를 확인했습니다.',
    groundingActionIds: ['STOP_CURRENT_ACTION'],
    groundingSignalTypes: ['PAYMENT_REQUEST'],
    incidentSummary: '보호자가 확인할 사건입니다.',
    title: '분석 결과',
  },
): ExplanationProvider {
  return {
    explain: vi.fn(async () => result),
  };
}
