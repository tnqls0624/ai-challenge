import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '돈워리 | 금융 안전 공동대응',
  description: '고령자의 보이스피싱 위험을 감지하고 보호자와 공동 대응합니다.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
