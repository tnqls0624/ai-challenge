import type { Metadata } from 'next';
import Link from 'next/link';
import { RISK_ENGINE_VERSION } from '@dont-worry/risk-engine';
import { evaluateDemoFixtures } from './evaluation';

export const metadata: Metadata = {
  title: '합성 fixture 평가 | 돈워리',
  description: '공개 데모와 동일한 RiskEngine의 고정 fixture 판정 결과',
};

export default function DemoEvaluationPage() {
  const summary = evaluateDemoFixtures();

  return (
    <main className="demo-page evaluation-page">
      <nav className="demo-nav" aria-label="평가 상단 탐색">
        <Link href="/">돈워리</Link>
        <span>합성 fixture 평가</span>
        <Link className="evaluation-back-link" href="/demo">
          데모로 돌아가기
        </Link>
      </nav>

      <header className="evaluation-header">
        <p className="eyebrow">REPRODUCIBLE SMOKE EVALUATION</p>
        <h1>판정 결과를 숫자와 실패 케이스로 확인합니다.</h1>
        <p>
          공개 데모와 같은 6개 합성 fixture를 RiskEngine v{RISK_ENGINE_VERSION}으로 다시 계산한
          결과입니다. 운영 API·DB·FCM은 호출하지 않습니다.
        </p>
      </header>

      <div className="demo-banner" role="note">
        <span aria-hidden="true">◆</span>이 표본은 흐름 재현용 smoke set입니다. 실제
        Recall·Precision 성능 주장에는 별도의 frozen test dataset을 사용해야 합니다.
      </div>

      <section className="evaluation-metrics" aria-label="평가 요약">
        <Metric
          label="예상 수준 일치"
          value={`${summary.exactMatches} / ${summary.total}`}
          note="fixture별 exact match"
        />
        <Metric
          label="위험 Recall"
          value={fraction(summary.riskyRecall)}
          note="HIGH·CRITICAL 표본"
        />
        <Metric
          label="정상 오탐"
          value={fraction(summary.falsePositives)}
          note="SAFE 표본 중 CAUTION 이상"
        />
        <Metric
          label="위험 근거 보유"
          value={fraction(summary.evidenceCoverage)}
          note="위험 표본의 signal"
        />
      </section>

      <section className="evaluation-table-card" aria-labelledby="fixture-results-title">
        <div className="evaluation-section-heading">
          <div>
            <p className="panel-kicker">고정 입력 · 결정적 출력</p>
            <h2 id="fixture-results-title">fixture별 결과</h2>
          </div>
          <span>정책 2026-07-28.1</span>
        </div>
        <div className="evaluation-table-scroll">
          <table className="evaluation-table">
            <thead>
              <tr>
                <th>Fixture</th>
                <th>시나리오</th>
                <th>예상</th>
                <th>실제</th>
                <th>점수</th>
                <th>근거</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {summary.results.map((result) => (
                <tr key={result.fixtureId}>
                  <td>{result.fixtureId}</td>
                  <td>{result.title}</td>
                  <td>{result.expectedLevel}</td>
                  <td>{result.actualLevel}</td>
                  <td>{result.score ?? '—'}</td>
                  <td>{result.signalCount}개</td>
                  <td>
                    <span className={result.exactMatch ? 'evaluation-pass' : 'evaluation-fail'}>
                      {result.exactMatch ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function fraction(value: { denominator: number; numerator: number }): string {
  return `${value.numerator} / ${value.denominator}`;
}
