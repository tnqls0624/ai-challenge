'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { getMessaging, isSupported, onMessage, onRegistered, register } from 'firebase/messaging';
import { guardianApi, type Incident } from '../../lib/api';
import { getGuardianAuth, getGuardianFirebaseApp, isFirebaseConfigured } from '../../lib/firebase';

const LEVEL_LABEL = {
  CAUTION: '주의',
  CRITICAL: '매우 위험',
  HIGH: '위험',
  SAFE: '안전',
  UNKNOWN: '확인 필요',
} as const;

const STATUS_LABEL = {
  ACKNOWLEDGED: '확인함',
  ESCALATED: '긴급 대응',
  IN_PROGRESS: '대응 중',
  OPEN: '미확인',
  RESOLVED: '해결',
} as const;

export default function DashboardPage() {
  const router = useRouter();
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<'disabled' | 'enabling' | 'enabled'>('disabled');

  const loadIncidents = useCallback(async (currentUser: User) => {
    try {
      const idToken = await currentUser.getIdToken();
      const result = await guardianApi<Incident[]>('/v1/incidents', idToken);
      setIncidents(result);
      setError(null);
    } catch {
      setError('사건 목록을 불러오지 못했습니다. 연결을 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      router.replace('/login');
      return;
    }
    return onAuthStateChanged(getGuardianAuth(), (currentUser) => {
      setAuthReady(true);
      setUser(currentUser);
      if (currentUser === null) {
        router.replace('/login');
        return;
      }
      void loadIncidents(currentUser);
    });
  }, [configured, loadIncidents, router]);

  useEffect(() => {
    if (user === null) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadIncidents(user);
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [loadIncidents, user]);

  const counts = useMemo(
    () => ({
      critical: incidents.filter(
        (incident) => incident.riskLevel === 'CRITICAL' && incident.status !== 'RESOLVED',
      ).length,
      open: incidents.filter((incident) => incident.status === 'OPEN').length,
      total: new Set(incidents.map((incident) => incident.subjectId)).size,
    }),
    [incidents],
  );

  async function enablePush(): Promise<void> {
    if (user === null) return;
    setPushState('enabling');
    setError(null);
    try {
      if (
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !(await isSupported())
      ) {
        throw new Error('unsupported');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('permission-denied');

      const serviceWorkerRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
      );
      const messaging = getMessaging(getGuardianFirebaseApp());
      const registrationId = await registerForMessaging(messaging, serviceWorkerRegistration);
      const idToken = await user.getIdToken();
      await guardianApi('/v1/guardian-push-subscriptions', idToken, {
        body: JSON.stringify({ token: registrationId }),
        method: 'POST',
      });
      onMessage(messaging, () => {
        void loadIncidents(user);
      });
      setPushState('enabled');
    } catch {
      setPushState('disabled');
      setError('웹 푸시를 켜지 못했습니다. 브라우저 권한과 Firebase 설정을 확인해 주세요.');
    }
  }

  if (!authReady || user === null) {
    return (
      <main className="dashboard-page">
        <p className="loading-copy">보호자 계정을 확인하고 있습니다…</p>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">W02 · 보호자 대시보드</p>
          <h1>{user.displayName ?? '보호자'}님, 먼저 볼 상황입니다.</h1>
          <p className="dashboard-intro">
            매우 위험한 미확인 사건과 행동 요구가 있는 사건을 먼저 보여드립니다.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="secondary-button"
            disabled={pushState !== 'disabled'}
            onClick={() => void enablePush()}
            type="button"
          >
            {pushState === 'enabled'
              ? '웹 푸시 켜짐'
              : pushState === 'enabling'
                ? '푸시 설정 중…'
                : '웹 푸시 켜기'}
          </button>
          <button
            className="text-button"
            onClick={() => void signOut(getGuardianAuth())}
            type="button"
          >
            로그아웃
          </button>
        </div>
      </header>

      <section className="summary-grid" aria-label="대응 현황">
        <article className="summary-card critical-summary">
          <span>매우 위험 · 대응 중</span>
          <strong>{counts.critical}</strong>
        </article>
        <article className="summary-card">
          <span>아직 확인하지 않음</span>
          <strong>{counts.open}</strong>
        </article>
        <article className="summary-card">
          <span>사건이 있는 대상자</span>
          <strong>{counts.total}</strong>
        </article>
      </section>

      {error !== null && (
        <div className="notice warning" role="alert">
          {error}
        </div>
      )}

      <section aria-labelledby="incident-list-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">우선순위 목록</p>
            <h2 id="incident-list-title">지금 확인할 사건</h2>
          </div>
          <button className="text-button" onClick={() => void loadIncidents(user)} type="button">
            새로고침
          </button>
        </div>

        {loading ? (
          <p className="loading-copy">사건을 불러오고 있습니다…</p>
        ) : incidents.length === 0 ? (
          <div className="empty-state">
            <strong>새로운 위험 사건이 없습니다.</strong>
            <span>위험 이벤트가 발생하면 이 목록에 즉시 표시됩니다.</span>
          </div>
        ) : (
          <div className="incident-list">
            {incidents.map((incident) => (
              <Link
                className={`incident-card level-${incident.riskLevel.toLowerCase()}`}
                href={`/incidents/${incident.id}`}
                key={incident.id}
              >
                <div className="incident-card-topline">
                  <span className="level-badge">{LEVEL_LABEL[incident.riskLevel]}</span>
                  <span className="status-badge">{STATUS_LABEL[incident.status]}</span>
                </div>
                <div className="incident-card-body">
                  <div>
                    <h3>{incident.subjectDisplayName}</h3>
                    <p>
                      {eventLabel(incident.eventType)} · {formatOccurredAt(incident.occurredAt)}
                    </p>
                  </div>
                  <span className="card-arrow" aria-hidden="true">
                    →
                  </span>
                </div>
                {incident.signalTypes.length > 0 && (
                  <p className="signal-summary">
                    {incident.signalTypes.slice(0, 2).map(signalLabel).join(' · ')}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

async function registerForMessaging(
  messaging: ReturnType<typeof getMessaging>,
  serviceWorkerRegistration: ServiceWorkerRegistration,
): Promise<string> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (vapidKey === undefined || vapidKey.length === 0) {
    throw new Error('Firebase VAPID key is missing');
  }
  return new Promise<string>((resolve, reject) => {
    let unsubscribe = (): void => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      reject(new Error('FCM registration timed out'));
    }, 10_000);
    unsubscribe = onRegistered(messaging, (registrationId) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(registrationId);
    });
    void register(messaging, { serviceWorkerRegistration, vapidKey }).catch((error: unknown) => {
      window.clearTimeout(timeout);
      unsubscribe();
      reject(error instanceof Error ? error : new Error('FCM registration failed'));
    });
  });
}

function eventLabel(type: Incident['eventType']): string {
  return {
    CALL: '전화',
    MANUAL: '직접 확인',
    SMS: '문자',
    URL: '링크',
  }[type];
}

function signalLabel(type: string): string {
  const labels: Record<string, string> = {
    APP_INSTALL_REQUEST: '앱 설치 요구',
    IMPERSONATION_OR_PRESSURE: '사칭·긴급 압박',
    PAYMENT_REQUEST: '송금·결제 요구',
    REMOTE_CONTROL_REQUEST: '원격 제어 요구',
    SECRET_REQUEST: '비밀정보 요구',
    VERIFIED_MALICIOUS_URL: '악성 링크 확인',
  };
  return labels[type] ?? '위험 신호';
}

function formatOccurredAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
