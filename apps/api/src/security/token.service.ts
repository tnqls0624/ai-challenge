import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenService {
  private readonly activationCodePepper: string;
  private readonly deviceCredentialSecret: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.activationCodePepper = configService.getOrThrow<string>('ACTIVATION_CODE_PEPPER');
    this.deviceCredentialSecret = configService.getOrThrow<string>('DEVICE_CREDENTIAL_SECRET');
  }

  generateActivationCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  digestActivationCode(code: string): string {
    return this.hmac(this.activationCodePepper, `activation-code:${code}`);
  }

  digestDeviceInstallation(deviceInstallationId: string): string {
    return this.hmac(this.activationCodePepper, `device-installation:${deviceInstallationId}`);
  }

  digestOpaqueToken(token: string): string {
    return this.hmac(this.activationCodePepper, `opaque-token:${token}`);
  }

  digestRateLimitKey(kind: 'device' | 'ip', value: string): string {
    return this.hmac(this.activationCodePepper, `rate-limit:${kind}:${value}`);
  }

  digestIdempotencyKey(scope: string, key: string): string {
    return this.hmac(this.deviceCredentialSecret, `idempotency:${scope}:${key}`);
  }

  deriveDeviceCredential(sessionId: string, idempotencyKey: string): string {
    return createHmac('sha256', this.deviceCredentialSecret)
      .update(`device-credential:${sessionId}:${idempotencyKey}`, 'utf8')
      .digest('base64url');
  }

  digestDeviceCredential(credential: string): string {
    return this.hmac(this.deviceCredentialSecret, `stored-device-credential:${credential}`);
  }

  fingerprintPublicKey(publicKey: string): string {
    return this.sha256(publicKey.trim());
  }

  digestRequest(value: string): string {
    return this.sha256(value);
  }

  digestPhoneNumber(value: string): string {
    return this.hmac(this.deviceCredentialSecret, `phone-number:${value}`);
  }

  digestPushToken(value: string): string {
    return this.hmac(this.deviceCredentialSecret, `push-token:${value}`);
  }

  private hmac(secret: string, value: string): string {
    return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
