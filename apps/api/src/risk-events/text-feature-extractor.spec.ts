import { describe, expect, it } from 'vitest';
import { extractTextFeatures } from './text-feature-extractor';

describe('extractTextFeatures', () => {
  it('extracts government impersonation and payment pressure without returning raw text', () => {
    const result = extractTextFeatures(
      '건강보험공단입니다. 오늘까지 아래 계좌로 미납금을 입금하세요.',
    );

    expect(result).toMatchObject({
      impersonatedEntityTypes: ['PUBLIC_AGENCY'],
      requestsPayment: true,
    });
    expect(result.riskKeywordIds).toEqual(expect.arrayContaining(['URGENCY', 'PAYMENT_REQUEST']));
    expect(JSON.stringify(result)).not.toContain('건강보험공단입니다');
  });

  it('extracts installation and remote-control requests', () => {
    expect(
      extractTextFeatures('보안 프로그램 앱을 설치하고 AnyDesk 원격 제어를 실행하세요.'),
    ).toMatchObject({
      requestsAppInstall: true,
      requestsRemoteControl: true,
    });
  });
});
