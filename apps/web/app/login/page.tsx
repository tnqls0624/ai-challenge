'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { guardianApi } from '../../lib/api';
import { getGuardianAuth, isFirebaseConfigured } from '../../lib/firebase';

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getGuardianAuth(), (user) => {
      if (user !== null) router.replace('/dashboard');
    });
  }, [configured, router]);

  async function signIn(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const credential = await signInWithPopup(getGuardianAuth(), new GoogleAuthProvider());
      const idToken = await credential.user.getIdToken();
      await guardianApi('/v1/auth/guardian/session', idToken, {
        body: JSON.stringify({
          displayName:
            credential.user.displayName ?? credential.user.email?.split('@')[0] ?? '보호자',
        }),
        method: 'POST',
      });
      router.replace('/dashboard');
    } catch {
      setError('로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="eyebrow">보호자 웹</p>
        <h1 id="login-title">돌봄이 필요한 순간을 놓치지 않도록.</h1>
        <p className="description compact">
          담당 대상자의 위험 사건을 우선순위대로 확인하고 대응 상태를 함께 기록합니다.
        </p>
        {!configured ? (
          <div className="notice warning" role="status">
            Firebase 웹 환경변수가 아직 설정되지 않았습니다. <code>apps/web/.env.example</code>을
            기준으로 로컬 설정을 추가해 주세요.
          </div>
        ) : (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void signIn()}
            type="button"
          >
            {busy ? '로그인 중…' : 'Google 계정으로 로그인'}
          </button>
        )}
        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
