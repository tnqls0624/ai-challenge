'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main>
          <h1>화면을 불러오지 못했습니다</h1>
          <p>잠시 후 다시 시도해 주세요. 반복되면 운영 담당자에게 알려 주세요.</p>
        </main>
      </body>
    </html>
  );
}
