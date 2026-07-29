import Link from 'next/link';
import { RISK_LEVELS } from '@dont-worry/contracts';
import { RISK_ENGINE_VERSION } from '@dont-worry/risk-engine';

export default function HomePage() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">DON&apos;T WORRY · 금융 안전 공동대응</p>
        <h1 id="page-title">의심되는 순간, 혼자 판단하지 않도록.</h1>
        <p className="description">
          돈워리는 고령자가 받은 문자와 전화의 위험 근거를 설명하고, 동의한 보호자와 다음 행동을
          함께 확인하는 서비스입니다.
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/demo">
            공개 합성 데모 체험
          </Link>
          <Link className="primary-link" href="/login">
            보호자 대시보드 시작
          </Link>
        </div>
        <div className="status" aria-label="개발 기반 상태">
          <span>Web · Next.js</span>
          <span>API · NestJS</span>
          <span>RiskEngine · v{RISK_ENGINE_VERSION}</span>
        </div>
        <p className="levels">지원 위험 단계: {RISK_LEVELS.join(' · ')}</p>
      </section>
    </main>
  );
}
