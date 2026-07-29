import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { TokenService } from '../security/token.service';
import { ActivationPreviewRateLimiter } from './activation-preview-rate-limiter';

function createLimiter(): ActivationPreviewRateLimiter {
  return new ActivationPreviewRateLimiter(
    new TokenService(
      new ConfigService({
        ACTIVATION_CODE_PEPPER: 'a'.repeat(32),
        DEVICE_CREDENTIAL_SECRET: 'b'.repeat(32),
      }),
    ),
  );
}

describe('ActivationPreviewRateLimiter', () => {
  it('allows five attempts and rejects the sixth', () => {
    const limiter = createLimiter();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => limiter.assertAllowed('127.0.0.1', 'installation-1', 1_000)).not.toThrow();
    }
    expect(() => limiter.assertAllowed('127.0.0.1', 'installation-1', 1_000)).toThrow(
      'Too many activation preview attempts',
    );
  });

  it('resets both hashed buckets after fifteen minutes', () => {
    const limiter = createLimiter();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.assertAllowed('127.0.0.1', 'installation-1', 1_000);
    }

    expect(() =>
      limiter.assertAllowed('127.0.0.1', 'installation-1', 1_000 + 15 * 60 * 1_000),
    ).not.toThrow();
  });
});
