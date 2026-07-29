import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service';

function createService(): TokenService {
  return new TokenService(
    new ConfigService({
      ACTIVATION_CODE_PEPPER: 'a'.repeat(32),
      DEVICE_CREDENTIAL_SECRET: 'b'.repeat(32),
    }),
  );
}

describe('TokenService', () => {
  it('creates zero-padded activation codes', () => {
    expect(createService().generateActivationCode()).toMatch(/^\d{6}$/);
  });

  it('uses domain-separated deterministic digests', () => {
    const service = createService();

    expect(service.digestActivationCode('123456')).toHaveLength(64);
    expect(service.digestActivationCode('123456')).toBe(service.digestActivationCode('123456'));
    expect(service.digestActivationCode('123456')).not.toBe(service.digestOpaqueToken('123456'));
  });

  it('derives an idempotent credential without storing the raw value', () => {
    const service = createService();
    const first = service.deriveDeviceCredential('session-id', 'same-key');

    expect(first).toBe(service.deriveDeviceCredential('session-id', 'same-key'));
    expect(first).not.toBe(service.deriveDeviceCredential('session-id', 'other-key'));
    expect(service.digestDeviceCredential(first)).toHaveLength(64);
  });
});
