import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const service = new EncryptionService(
    new ConfigService({
      PUSH_TOKEN_ENCRYPTION_KEY: 'test-push-encryption-key-at-least-32',
    }),
  );

  it('round trips without embedding plaintext', () => {
    const encrypted = service.encrypt('fcm-secret-token');

    expect(encrypted).not.toContain('fcm-secret-token');
    expect(service.decrypt(encrypted)).toBe('fcm-secret-token');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = service.encrypt('fcm-secret-token');

    expect(() => service.decrypt(`${encrypted}x`)).toThrow();
  });
});
