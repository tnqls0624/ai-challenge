const LOCAL_DATABASE_URL =
  'postgresql://dontworry:dontworry_local@localhost:5434/dontworry?schema=public';
const LOCAL_ACTIVATION_CODE_PEPPER = 'local-only-activation-pepper-change-me-32';
const LOCAL_DEVICE_CREDENTIAL_SECRET = 'local-only-device-secret-change-me-32';
const LOCAL_PUSH_TOKEN_ENCRYPTION_KEY = 'local-only-push-token-key-change-me-32';
const LOCAL_WEB_ORIGIN = 'http://localhost:3000';

const NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);
const LLM_PROVIDERS = new Set(['template', 'openai']);

export type AppEnvironment = {
  ACTIVATION_CODE_PEPPER: string;
  DATABASE_URL: string;
  DEVICE_CREDENTIAL_SECRET: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  LLM_DEVICE_MINUTE_LIMIT: number;
  LLM_GLOBAL_DAILY_LIMIT: number;
  LLM_PROVIDER: 'openai' | 'template';
  NODE_ENV: 'development' | 'test' | 'production';
  OPENAI_API_KEY?: string;
  OPENAI_EXPLANATION_MODEL?: string;
  PORT: number;
  PUSH_TOKEN_ENCRYPTION_KEY: string;
  WEB_ORIGIN: string;
  WORKER_ENABLED: boolean;
};

export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const rawNodeEnvironment = input.NODE_ENV ?? 'development';
  if (typeof rawNodeEnvironment !== 'string' || !NODE_ENVIRONMENTS.has(rawNodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const nodeEnvironment = rawNodeEnvironment as AppEnvironment['NODE_ENV'];

  const databaseUrl =
    typeof input.DATABASE_URL === 'string' && input.DATABASE_URL.length > 0
      ? input.DATABASE_URL
      : nodeEnvironment === 'production'
        ? undefined
        : LOCAL_DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required in production');
  }
  assertPostgresUrl(databaseUrl);

  const port = Number(input.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const activationCodePepper = resolveSecret(
    input.ACTIVATION_CODE_PEPPER,
    nodeEnvironment,
    'ACTIVATION_CODE_PEPPER',
    LOCAL_ACTIVATION_CODE_PEPPER,
  );
  const deviceCredentialSecret = resolveSecret(
    input.DEVICE_CREDENTIAL_SECRET,
    nodeEnvironment,
    'DEVICE_CREDENTIAL_SECRET',
    LOCAL_DEVICE_CREDENTIAL_SECRET,
  );
  const pushTokenEncryptionKey = resolveSecret(
    input.PUSH_TOKEN_ENCRYPTION_KEY,
    nodeEnvironment,
    'PUSH_TOKEN_ENCRYPTION_KEY',
    LOCAL_PUSH_TOKEN_ENCRYPTION_KEY,
  );
  if (new Set([activationCodePepper, deviceCredentialSecret, pushTokenEncryptionKey]).size !== 3) {
    throw new Error('Application security secrets must be different');
  }
  const workerEnabled = resolveBoolean(
    input.WORKER_ENABLED,
    nodeEnvironment === 'production',
    'WORKER_ENABLED',
  );
  const webOrigin =
    typeof input.WEB_ORIGIN === 'string' && input.WEB_ORIGIN.length > 0
      ? input.WEB_ORIGIN
      : nodeEnvironment === 'production'
        ? undefined
        : LOCAL_WEB_ORIGIN;
  if (webOrigin === undefined) {
    throw new Error('WEB_ORIGIN is required in production');
  }
  assertWebOrigin(webOrigin, nodeEnvironment);

  const firebaseProjectId =
    typeof input.FIREBASE_PROJECT_ID === 'string' && input.FIREBASE_PROJECT_ID.length > 0
      ? input.FIREBASE_PROJECT_ID
      : undefined;
  if (nodeEnvironment === 'production' && firebaseProjectId === undefined) {
    throw new Error('FIREBASE_PROJECT_ID is required in production');
  }
  const firebaseClientEmail = optionalNonEmptyString(
    input.FIREBASE_CLIENT_EMAIL,
    'FIREBASE_CLIENT_EMAIL',
  );
  const firebasePrivateKey = optionalNonEmptyString(
    input.FIREBASE_PRIVATE_KEY,
    'FIREBASE_PRIVATE_KEY',
  );
  if ((firebaseClientEmail === undefined) !== (firebasePrivateKey === undefined)) {
    throw new Error('FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured together');
  }

  const rawLlmProvider = input.LLM_PROVIDER ?? 'template';
  if (typeof rawLlmProvider !== 'string' || !LLM_PROVIDERS.has(rawLlmProvider)) {
    throw new Error('LLM_PROVIDER must be template or openai');
  }
  const llmProvider = rawLlmProvider as AppEnvironment['LLM_PROVIDER'];
  const openAiApiKey = optionalNonEmptyString(input.OPENAI_API_KEY, 'OPENAI_API_KEY');
  const openAiExplanationModel = optionalNonEmptyString(
    input.OPENAI_EXPLANATION_MODEL,
    'OPENAI_EXPLANATION_MODEL',
  );
  if (llmProvider === 'openai' && openAiApiKey === undefined) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
  }
  if (llmProvider === 'openai' && openAiExplanationModel === undefined) {
    throw new Error('OPENAI_EXPLANATION_MODEL is required when LLM_PROVIDER=openai');
  }
  const llmDeviceMinuteLimit = resolvePositiveInteger(
    input.LLM_DEVICE_MINUTE_LIMIT,
    6,
    'LLM_DEVICE_MINUTE_LIMIT',
  );
  const llmGlobalDailyLimit = resolvePositiveInteger(
    input.LLM_GLOBAL_DAILY_LIMIT,
    500,
    'LLM_GLOBAL_DAILY_LIMIT',
  );

  return {
    ...input,
    ACTIVATION_CODE_PEPPER: activationCodePepper,
    DATABASE_URL: databaseUrl,
    DEVICE_CREDENTIAL_SECRET: deviceCredentialSecret,
    FIREBASE_CLIENT_EMAIL: firebaseClientEmail,
    FIREBASE_PRIVATE_KEY: firebasePrivateKey,
    FIREBASE_PROJECT_ID: firebaseProjectId,
    LLM_DEVICE_MINUTE_LIMIT: llmDeviceMinuteLimit,
    LLM_GLOBAL_DAILY_LIMIT: llmGlobalDailyLimit,
    LLM_PROVIDER: llmProvider,
    NODE_ENV: nodeEnvironment,
    OPENAI_API_KEY: openAiApiKey,
    OPENAI_EXPLANATION_MODEL: openAiExplanationModel,
    PORT: port,
    PUSH_TOKEN_ENCRYPTION_KEY: pushTokenEncryptionKey,
    WEB_ORIGIN: webOrigin,
    WORKER_ENABLED: workerEnabled,
  };
}

function resolvePositiveInteger(rawValue: unknown, defaultValue: number, name: string): number {
  if (rawValue === undefined || rawValue === '') return defaultValue;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function optionalNonEmptyString(rawValue: unknown, name: string): string | undefined {
  if (rawValue === undefined || rawValue === '') return undefined;
  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return rawValue;
}

function assertPostgresUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid URL');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql protocol');
  }
}

function resolveSecret(
  rawValue: unknown,
  nodeEnvironment: AppEnvironment['NODE_ENV'],
  name: string,
  localDefault: string,
): string {
  const value = typeof rawValue === 'string' && rawValue.length > 0 ? rawValue : undefined;
  if (value === undefined && nodeEnvironment === 'production') {
    throw new Error(`${name} is required in production`);
  }
  const resolved = value ?? localDefault;
  if (resolved.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return resolved;
}

function resolveBoolean(rawValue: unknown, defaultValue: boolean, name: string): boolean {
  if (rawValue === undefined || rawValue === '') {
    return defaultValue;
  }
  if (rawValue === true || rawValue === 'true') {
    return true;
  }
  if (rawValue === false || rawValue === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function assertWebOrigin(value: string, nodeEnvironment: AppEnvironment['NODE_ENV']): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('WEB_ORIGIN must be a valid URL origin');
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== value) {
    throw new Error('WEB_ORIGIN must be a valid URL origin');
  }
  if (nodeEnvironment === 'production' && url.protocol !== 'https:') {
    throw new Error('WEB_ORIGIN must use HTTPS in production');
  }
}
