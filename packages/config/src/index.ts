export interface ServiceConfig {
  serviceName: string;
  host: string;
  port: number;
  postgresUrl: string;
  redisUrl: string;
  nodeEnv: string;
  logLevel: string;
}

const DEFAULT_POSTGRES_URL = 'postgresql://postgres:postgres@localhost:5432/scaffhold';
const DEFAULT_REDIS_URL = 'redis://localhost:6379';

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redactConnectionString(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'invalid-connection-string';
  }
}

export function loadServiceConfig(
  serviceName: string,
  defaultPort: number,
  env: NodeJS.ProcessEnv = process.env
): ServiceConfig {
  return {
    serviceName,
    host: env.HOST ?? '0.0.0.0',
    port: parsePort(env.PORT, defaultPort),
    postgresUrl: env.POSTGRES_URL ?? DEFAULT_POSTGRES_URL,
    redisUrl: env.REDIS_URL ?? DEFAULT_REDIS_URL,
    nodeEnv: env.NODE_ENV ?? 'development',
    logLevel: env.LOG_LEVEL ?? 'info'
  };
}

export function dependencySummary(config: ServiceConfig): Record<string, string> {
  return {
    postgres: redactConnectionString(config.postgresUrl),
    redis: redactConnectionString(config.redisUrl)
  };
}

export const redisKeys = {
  cache: (namespace: string, key: string): string => `cache:${namespace}:${key}`,
  lock: (scope: string, key: string): string => `lock:${scope}:${key}`,
  idempotency: (key: string): string => `idempotency:${key}`
};

export const eventStreamChannels = {
  campaignCompilation: 'events:campaign.compilation',
  domainVerification: 'events:domain.verification',
  walletConnection: 'events:wallet.connection',
  transactionLifecycle: 'events:transaction.lifecycle'
};

export const transactionEngineProductionTodos = [
  'Integrate HSM or KMS-backed signing before enabling any signing path.',
  'Enforce contract and method allowlists before simulation and submission.',
  'Require explicit end-user consent records before any wallet action.',
  'Run transaction simulation with gas and state-diff checks before broadcast.',
  'Add rate limiting, idempotency storage, and nonce-locking in Redis.',
  'Persist audit logs for every approval, simulation, and submission decision.',
  'Verify approved domains and campaign authorization before preparing transactions.'
];
