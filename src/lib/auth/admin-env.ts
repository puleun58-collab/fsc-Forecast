export class AdminEnvConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminEnvConfigurationError';
  }
}

export type AdminAuthEnv = {
  passwordHash: string;
  sessionSecret: string;
  sessionMaxAgeDays: number;
};

const DEFAULT_SESSION_MAX_AGE_DAYS = 14;

function readRequiredString(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AdminEnvConfigurationError(`Missing required admin environment variable: ${name}`);
  }

  return value;
}

function readSessionMaxAgeDays(): number {
  const rawValue = process.env.ADMIN_SESSION_MAX_AGE_DAYS?.trim();

  if (!rawValue) {
    return DEFAULT_SESSION_MAX_AGE_DAYS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminEnvConfigurationError('ADMIN_SESSION_MAX_AGE_DAYS must be a positive integer.');
  }

  return parsedValue;
}

export function readAdminAuthEnv(): AdminAuthEnv {
  const passwordHash = readRequiredString('ADMIN_PASSWORD_HASH');
  const sessionSecret = readRequiredString('ADMIN_SESSION_SECRET');

  if (Buffer.byteLength(sessionSecret, 'utf8') < 32) {
    throw new AdminEnvConfigurationError('ADMIN_SESSION_SECRET must be at least 32 bytes long.');
  }

  return {
    passwordHash,
    sessionSecret,
    sessionMaxAgeDays: readSessionMaxAgeDays(),
  };
}

export function isAdminAuthConfigured(): boolean {
  try {
    readAdminAuthEnv();
    return true;
  } catch {
    return false;
  }
}
