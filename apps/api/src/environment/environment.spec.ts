import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('uses safe local defaults outside production', () => {
    const result = validateEnvironment({});

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(4000);
    expect(result.DATABASE_URL).toContain('localhost:5434');
    expect(result.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(result.WORKER_ENABLED).toBe(false);
    expect(result.LLM_PROVIDER).toBe('template');
    expect(result.LLM_DEVICE_MINUTE_LIMIT).toBe(6);
    expect(result.LLM_GLOBAL_DAILY_LIMIT).toBe(500);
  });

  it('requires a database URL in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL is required in production',
    );
  });

  it.each([
    { DATABASE_URL: 'https://example.com', expected: 'postgresql protocol' },
    { DATABASE_URL: 'not a URL', expected: 'valid URL' },
    { PORT: '70000', expected: 'PORT' },
    { NODE_ENV: 'preview', expected: 'NODE_ENV' },
    { ACTIVATION_CODE_PEPPER: 'short', expected: 'ACTIVATION_CODE_PEPPER' },
    { WORKER_ENABLED: 'yes', expected: 'WORKER_ENABLED' },
    { WEB_ORIGIN: 'https://example.com/path', expected: 'WEB_ORIGIN' },
    { LLM_PROVIDER: 'unknown', expected: 'LLM_PROVIDER' },
    { LLM_DEVICE_MINUTE_LIMIT: '0', expected: 'LLM_DEVICE_MINUTE_LIMIT' },
    { LLM_GLOBAL_DAILY_LIMIT: '1.5', expected: 'LLM_GLOBAL_DAILY_LIMIT' },
  ])('rejects invalid environment input %#', ({ expected, ...input }) => {
    expect(() => validateEnvironment(input)).toThrow(expected);
  });

  it('requires all production security configuration', () => {
    const base = {
      DATABASE_URL: 'postgresql://db.example.com/dontworry',
      NODE_ENV: 'production',
    };

    expect(() => validateEnvironment(base)).toThrow('ACTIVATION_CODE_PEPPER');
    expect(() =>
      validateEnvironment({
        ...base,
        ACTIVATION_CODE_PEPPER: 'a'.repeat(32),
      }),
    ).toThrow('DEVICE_CREDENTIAL_SECRET');
    expect(() =>
      validateEnvironment({
        ...base,
        ACTIVATION_CODE_PEPPER: 'a'.repeat(32),
        DEVICE_CREDENTIAL_SECRET: 'b'.repeat(32),
      }),
    ).toThrow('PUSH_TOKEN_ENCRYPTION_KEY');
    expect(() =>
      validateEnvironment({
        ...base,
        ACTIVATION_CODE_PEPPER: 'a'.repeat(32),
        DEVICE_CREDENTIAL_SECRET: 'b'.repeat(32),
        PUSH_TOKEN_ENCRYPTION_KEY: 'c'.repeat(32),
      }),
    ).toThrow('WEB_ORIGIN');
    expect(() =>
      validateEnvironment({
        ...base,
        ACTIVATION_CODE_PEPPER: 'a'.repeat(32),
        DEVICE_CREDENTIAL_SECRET: 'b'.repeat(32),
        PUSH_TOKEN_ENCRYPTION_KEY: 'c'.repeat(32),
        WEB_ORIGIN: 'https://app.example.com',
      }),
    ).toThrow('FIREBASE_PROJECT_ID');
  });

  it('requires OpenAI credentials only when the provider is enabled', () => {
    expect(() => validateEnvironment({ LLM_PROVIDER: 'openai' })).toThrow('OPENAI_API_KEY');
    expect(() =>
      validateEnvironment({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
      }),
    ).toThrow('OPENAI_EXPLANATION_MODEL');

    expect(
      validateEnvironment({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        OPENAI_EXPLANATION_MODEL: 'configured-model',
      }).LLM_PROVIDER,
    ).toBe('openai');
  });

  it('requires Firebase service-account fields as a pair', () => {
    expect(() =>
      validateEnvironment({
        FIREBASE_CLIENT_EMAIL: 'firebase-admin@example.test',
      }),
    ).toThrow('must be configured together');
    expect(() =>
      validateEnvironment({
        FIREBASE_PRIVATE_KEY: 'private-key',
      }),
    ).toThrow('must be configured together');

    const result = validateEnvironment({
      FIREBASE_CLIENT_EMAIL: 'firebase-admin@example.test',
      FIREBASE_PRIVATE_KEY: 'private-key',
    });
    expect(result.FIREBASE_CLIENT_EMAIL).toBe('firebase-admin@example.test');
  });
});
