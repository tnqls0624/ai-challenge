import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const VERSION = 'v1';
const IV_BYTES = 12;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.key = createHash('sha256')
      .update(configService.getOrThrow<string>('PUSH_TOKEN_ENCRYPTION_KEY'), 'utf8')
      .digest();
  }

  encrypt(plaintext: string): string {
    const initializationVector = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, initializationVector);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      VERSION,
      initializationVector.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string): string {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split('.');
    if (
      version !== VERSION ||
      encodedIv === undefined ||
      encodedTag === undefined ||
      encodedCiphertext === undefined ||
      extra !== undefined
    ) {
      throw new Error('Unsupported encrypted value');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
