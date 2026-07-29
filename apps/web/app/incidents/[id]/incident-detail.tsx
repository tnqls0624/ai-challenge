'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { GuardianApiError, guardianApi, type Incident } from '../../../lib/api';
import { getGuardianAuth, isFirebaseConfigured } from '../../../lib/firebase';

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (currentUser: User) => {
      try {
        const idToken = await currentUser.getIdToken();
        setIncident(await guardianApi<Incident>(`/v1/incidents/${incidentId}`, idToken));
        setError(null);
      } catch {
        setError('사건 정보를 불러오지 못했습니다.');
      }
    },
    [incidentId],
  );

  useEffect(() => {
    if (!configured) {
      router.replace('/login');
      return;
    }
    return onAuthStateChanged(getGuardianAuth(), (currentUser) => {
      setUser(currentUser);
      if (currentUser === null) {
        router.replace('/login');
      } else {
        void load(currentUser);
      }
    });
  }, [configured, load, router]);

  async function changeStatus(status: 'ACKNOWLEDGED' | 'RESOLVED'): Promise<void> {
    if (user === null || incident === null) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      setIncident(
        await guardianApi<Incident>(`/v1/incidents/${incident.id}/status`, idToken, {
          body: JSON.stringify({ status, version: incident.version }),
          method: 'PATCH',
        }),
      );
      setError(null);
    } catch (caught) {
      if (caught instanceof GuardianApiError && caught.code === 'STALE_INCIDENT_VERSION') {
        await load(user);
        setError('다른 화면에서 상태가 변경되어 최신 정보로 갱신했습니다.');
      } else {
        setError('상태를 변경하지 못했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleAction(actionId: string, completed: boolean): Promise<void> {
    if (user === null) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      setIncident(
        await guardianApi<Incident>(`/v1/action-items/${actionId}`, idToken, {
          body: JSON.stringify({ completed }),
          method: 'PATCH',
        }),
      );
      setError(null);
    } catch {
      setError('체크리스트를 변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStage(stage: NonNullable<Incident['stage']>): Promise<void> {
    if (user === null || incident === null) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      setIncident(
        await guardianApi<Incident>(`/v1/incidents/${incident.id}/stage`, idToken, {
          body: JSON.stringify({ stage, version: incident.version }),
          method: 'PATCH',
        }),
      );
      setError(null);
    } catch (caught) {
      if (caught instanceof GuardianApiError && caught.code === 'STALE_INCIDENT_VERSION') {
        await load(user);
        setError('다른 화면에서 단계가 변경되어 최신 정보로 갱신했습니다.');
      } else {
        setError('피해 단계를 변경하지 못했습니다.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (incident === null) {
    return (
      <main className="detail-page">
        <p className="loading-copy">{error ?? '사건을 불러오고 있습니다…'}</p>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <Link className="back-link" href="/dashboard">
        ← 대시보드
      </Link>
      <header className={`detail-hero level-${incident.riskLevel.toLowerCase()}`}>
        <div>
          <p className="eyebrow">W06 · 사건 상세</p>
          <h1>{incident.subjectDisplayName}님의 상황</h1>
          <p className="detail-summary">
            {incident.summary ??
              (incident.riskLevel === 'CRITICAL'
                ? '지금 바로 상황을 확인해 주세요.'
                : '위험 신호가 확인되었습니다.')}
          </p>
        </div>
        <div className="detail-level">{incident.riskLevel}</div>
      </header>

      {error !== null && (
        <div className="notice warning" role="alert">
          {error}
        </div>
      )}

      <section className="detail-grid">
        <article className="detail-panel">
          <p className="panel-kicker">현재 대응</p>
          <h2>{incident.status === 'OPEN' ? '아직 확인 전' : incident.status}</h2>
          <p>
            발생 시각{' '}
            {new Intl.DateTimeFormat('ko-KR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(incident.occurredAt))}
          </p>
          <div className="button-row">
            {incident.status === 'OPEN' && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void changeStatus('ACKNOWLEDGED')}
                type="button"
              >
                상황 확인 시작
              </button>
            )}
            {incident.status !== 'OPEN' && incident.status !== 'RESOLVED' && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void changeStatus('RESOLVED')}
                type="button"
              >
                대응 완료
              </button>
            )}
          </div>
        </article>

        <article className="detail-panel">
          <p className="panel-kicker">공유 범위</p>
          <h2>{incident.shareLevel === 'BASIC' ? '기본 공유' : '최소 공유'}</h2>
          <p>
            {incident.shareLevel === 'BASIC'
              ? '행동 신호와 대응 체크리스트를 함께 볼 수 있습니다.'
              : '위험 수준·유형·시각만 공유하도록 설정되어 있습니다.'}
          </p>
        </article>
      </section>

      {incident.stage !== null && (
        <section className="detail-panel wide-panel" aria-labelledby="stage-title">
          <p className="panel-kicker">피해 단계</p>
          <h2 id="stage-title">
            {incident.stage} · {stageLabel(incident.stage)}
          </h2>
          <p>확인된 행동에 맞는 단계를 선택하면 현재 대응 체크리스트가 바뀝니다.</p>
          <label className="stage-control">
            <span>현재 단계 변경</span>
            <select
              disabled={busy || incident.status === 'RESOLVED'}
              onChange={(event) =>
                void changeStage(event.target.value as NonNullable<Incident['stage']>)
              }
              value={incident.stage}
            >
              {(['S0', 'S1', 'S2', 'S3', 'S4'] as const).map((stage) => (
                <option key={stage} value={stage}>
                  {stage} · {stageLabel(stage)}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="detail-panel wide-panel" aria-labelledby="actions-title">
        <p className="panel-kicker">지금 할 일</p>
        <h2 id="actions-title">대응 체크리스트</h2>
        {incident.actionItems.length === 0 ? (
          <p>최소 공유 설정에서는 체크리스트 상세를 표시하지 않습니다.</p>
        ) : (
          <div className="action-list">
            {incident.actionItems.map((action) => (
              <label className="action-item" key={action.id}>
                <input
                  checked={action.status === 'COMPLETED'}
                  disabled={busy}
                  onChange={(event) => void toggleAction(action.id, event.target.checked)}
                  type="checkbox"
                />
                <span>{action.title}</span>
              </label>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function stageLabel(stage: NonNullable<Incident['stage']>): string {
  return {
    S0: '아직 행동하지 않음',
    S1: '링크를 열었음',
    S2: '개인정보를 입력했음',
    S3: '앱을 설치했음',
    S4: '송금·결제를 완료했음',
  }[stage];
}
