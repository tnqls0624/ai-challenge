'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RISK_ENGINE_VERSION } from '@dont-worry/risk-engine';
import {
  DEMO_SCENARIOS,
  evaluateDemoScenario,
  findDemoScenario,
  type DemoScenario,
} from './scenarios';

const STORAGE_KEY = 'dont-worry-demo-session-v1';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const STEP_LABELS = ['시나리오', '판정', '설명', '모의 알림', '공동대응'] as const;

type DemoSession = {
  completedActions: string[];
  savedAt: number;
  scenarioId: string;
  step: number;
};

export function DemoExperience() {
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0]!.id);
  const [step, setStep] = useState(0);
  const [completedActions, setCompletedActions] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const scenario = findDemoScenario(scenarioId);
  const decision = useMemo(() => evaluateDemoScenario(scenario), [scenario]);

  useEffect(() => {
    const saved = readSession();
    if (saved !== null) {
      setScenarioId(saved.scenarioId);
      setStep(saved.step);
      setCompletedActions(saved.completedActions);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    const session: DemoSession = {
      completedActions,
      savedAt: Date.now(),
      scenarioId,
      step,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }, [completedActions, restored, scenarioId, step]);

  function chooseScenario(next: DemoScenario): void {
    setScenarioId(next.id);
    setStep(0);
    setCompletedActions([]);
  }

  function restart(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    setScenarioId(DEMO_SCENARIOS[0]!.id);
    setStep(0);
    setCompletedActions([]);
  }

  return (
    <main className="demo-page">
      <nav className="demo-nav" aria-label="데모 상단 탐색">
        <Link href="/">돈워리</Link>
        <Link className="demo-evaluation-link" href="/demo/evaluation">
          fixture 평가 보기
        </Link>
        <button className="text-button" onClick={restart} type="button">
          처음부터
        </button>
      </nav>

      <header className="demo-header">
        <div>
          <p className="eyebrow">JUDGE MODE · 로그인 없음</p>
          <h1>경고 이후의 행동까지, 한 흐름으로.</h1>
          <p>
            여섯 가지 합성 시나리오로 위험 판정, 쉬운 설명, 보호자 알림, 피해 단계별 대응을 확인해
            보세요.
          </p>
        </div>
        <div className="demo-safety-card" role="note">
          <strong>안전하게 격리된 데모</strong>
          <span>실제 개인정보 없음</span>
          <span>API · DB · FCM 호출 없음</span>
          <span>브라우저에서 RiskEngine v{RISK_ENGINE_VERSION} 실행</span>
        </div>
      </header>

      <div className="demo-banner" role="status">
        <span aria-hidden="true">◆</span>
        모든 내용은 합성 fixture이며 알림은 실제로 전송되지 않습니다.
      </div>

      <ol className="demo-steps" aria-label="데모 진행 단계">
        {STEP_LABELS.map((label, index) => (
          <li
            aria-current={step === index ? 'step' : undefined}
            className={step >= index ? 'active' : ''}
            key={label}
          >
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="demo-workspace">
        <aside className="scenario-panel" aria-labelledby="scenario-list-title">
          <div className="scenario-heading">
            <p className="panel-kicker">6개 고정 fixture</p>
            <h2 id="scenario-list-title">시나리오 선택</h2>
          </div>
          <div className="scenario-list">
            {DEMO_SCENARIOS.map((item, index) => (
              <button
                aria-pressed={scenario.id === item.id}
                className={scenario.id === item.id ? 'scenario-button selected' : 'scenario-button'}
                key={item.id}
                onClick={() => chooseScenario(item)}
                type="button"
              >
                <span className="scenario-number">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.value}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="demo-stage" aria-live="polite">
          <div className="fixture-meta">
            <span>{scenario.fixtureId}</span>
            <span>{scenario.input.eventType}</span>
            <span>정책 {scenario.input.policyVersion}</span>
          </div>
          <p className="panel-kicker">
            STEP {step + 1} · {STEP_LABELS[step]}
          </p>
          <h2>{scenario.title}</h2>
          <p className="stage-description">{scenario.description}</p>

          {step === 0 && (
            <div className="sample-card">
              <span>심사용 합성 입력</span>
              <blockquote>{scenario.sample}</blockquote>
              <p>입력은 이 브라우저 안에서만 공통 RiskEngine으로 계산됩니다.</p>
            </div>
          )}

          {step >= 1 && (
            <section
              className={`analysis-result level-${decision.level.toLowerCase()}`}
              aria-labelledby="analysis-title"
            >
              <div>
                <span>결정적 판정 결과</span>
                <h3 id="analysis-title">{levelLabel(decision.level)}</h3>
                <p>
                  점수 {decision.score ?? '판단 불가'} · 신뢰도{' '}
                  {confidenceLabel(decision.confidence)}
                </p>
              </div>
              <strong>{decision.level}</strong>
            </section>
          )}

          {step === 1 && (
            <>
              <div className="pipeline" aria-label="분석 단계">
                <span>입력 특징</span>
                <b>→</b>
                <span>결정적 규칙</span>
                <b>→</b>
                <span>고정 평판</span>
                <b>→</b>
                <span>행동 신호</span>
              </div>
              <ul className="evidence-list">
                {decision.signals.length === 0 ? (
                  <li>충분한 입력에서 위험 행동이나 의심 평판 신호가 확인되지 않았습니다.</li>
                ) : (
                  decision.signals.map((signal) => <li key={signal.type}>{signal.evidence}</li>)
                )}
              </ul>
            </>
          )}

          {step === 2 && (
            <div className="explanation-card">
              <span>검수된 템플릿 설명 · LLM 장애 시 동일 fallback</span>
              <h3>{explanationTitle(decision.level)}</h3>
              <p>{decision.signals[0]?.evidence ?? safeEvidence(decision.level)}</p>
              <strong>{scenario.actions[0]}</strong>
              <small>설명은 판정 수준과 알림 여부를 바꿀 수 없습니다.</small>
            </div>
          )}

          {step === 3 && (
            <div className="mock-phone" aria-label="모의 보호자 알림">
              <div className="mock-phone-top">
                <span>모의 알림</span>
                <span>지금</span>
              </div>
              <strong>돈워리 · {scenario.title}</strong>
              <p>{scenario.mockNotification}</p>
              <div className="mock-actions">
                <span>사건 보기</span>
                <span>전화하기</span>
              </div>
              <small>실제 FCM 전송 없음</small>
            </div>
          )}

          {step === 4 && (
            <div className="response-card">
              <div className="response-heading">
                <span className="stage-badge">{scenario.stage}</span>
                <div>
                  <p>현재 피해 단계</p>
                  <h3>{stageLabel(scenario.stage)}</h3>
                </div>
              </div>
              <div className="demo-checklist">
                {scenario.actions.map((action) => (
                  <label key={action}>
                    <input
                      checked={completedActions.includes(action)}
                      onChange={(event) =>
                        setCompletedActions((current) =>
                          event.target.checked
                            ? [...current, action]
                            : current.filter((item) => item !== action),
                        )
                      }
                      type="checkbox"
                    />
                    <span>{action}</span>
                  </label>
                ))}
              </div>
              <p className="completion-copy">
                {completedActions.length} / {scenario.actions.length}개 대응 확인
              </p>
            </div>
          )}

          <div className="demo-controls">
            {step > 0 && (
              <button
                className="secondary-button"
                onClick={() => setStep((current) => current - 1)}
                type="button"
              >
                이전
              </button>
            )}
            {step < STEP_LABELS.length - 1 ? (
              <button
                className="primary-button"
                onClick={() => setStep((current) => current + 1)}
                type="button"
              >
                {nextButtonLabel(step)}
              </button>
            ) : (
              <button
                className="primary-button"
                onClick={() => chooseNextScenario(scenario, chooseScenario)}
                type="button"
              >
                다음 시나리오
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function readSession(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as Partial<DemoSession>;
    if (
      typeof value.savedAt !== 'number' ||
      Date.now() - value.savedAt > SESSION_MAX_AGE_MS ||
      typeof value.scenarioId !== 'string' ||
      !DEMO_SCENARIOS.some((scenario) => scenario.id === value.scenarioId) ||
      typeof value.step !== 'number' ||
      value.step < 0 ||
      value.step >= STEP_LABELS.length ||
      !Array.isArray(value.completedActions)
    ) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      completedActions: value.completedActions.filter(
        (item): item is string => typeof item === 'string',
      ),
      savedAt: value.savedAt,
      scenarioId: value.scenarioId,
      step: value.step,
    };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function chooseNextScenario(current: DemoScenario, choose: (scenario: DemoScenario) => void): void {
  const index = DEMO_SCENARIOS.findIndex((scenario) => scenario.id === current.id);
  choose(DEMO_SCENARIOS[(index + 1) % DEMO_SCENARIOS.length]!);
}

function nextButtonLabel(step: number): string {
  return ['분석 시작', '쉬운 설명 보기', '보호자 알림 보기', '공동대응 보기'][step]!;
}

function levelLabel(level: ReturnType<typeof evaluateDemoScenario>['level']): string {
  return {
    CAUTION: '주의가 필요합니다',
    CRITICAL: '매우 위험합니다',
    HIGH: '위험합니다',
    SAFE: '확인된 위험 신호 없음',
    UNKNOWN: '판단할 정보 부족',
  }[level];
}

function confidenceLabel(
  confidence: ReturnType<typeof evaluateDemoScenario>['confidence'],
): string {
  return { HIGH: '높음', LOW: '낮음', MEDIUM: '보통' }[confidence];
}

function explanationTitle(level: ReturnType<typeof evaluateDemoScenario>['level']): string {
  return {
    CAUTION: '멈추고 한 번 더 확인해 주세요',
    CRITICAL: '지금 행동을 멈추고 도움을 요청하세요',
    HIGH: '혼자 진행하지 말고 함께 확인하세요',
    SAFE: '현재 확인된 위험 신호는 없습니다',
    UNKNOWN: '추가 확인이 필요합니다',
  }[level];
}

function safeEvidence(level: ReturnType<typeof evaluateDemoScenario>['level']): string {
  return level === 'SAFE'
    ? '충분한 입력을 확인했으며 위험 행동 신호가 발견되지 않았습니다.'
    : '현재 입력만으로는 위험 여부를 단정할 수 없습니다.';
}

function stageLabel(stage: DemoScenario['stage']): string {
  return {
    S0: '접촉 단계 · 먼저 멈추고 확인',
    S1: '링크 열람 · 추가 행동 차단',
    S2: '정보 입력 · 계정 보호',
    S3: '앱 설치 · 기기 격리',
    S4: '금전 피해 · 즉시 신고와 지급정지',
  }[stage];
}
