import 'server-only';

import { cookies } from 'next/headers';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { AdminEnvConfigurationError, isAdminAuthConfigured, readAdminAuthEnv } from '@/lib/auth/admin-env';

const scrypt = promisify(scryptCallback);
const ADMIN_SESSION_COOKIE_NAME = 'fsc_admin_session';
const ADMIN_SESSION_VERSION = 1;

type AdminSessionPayload = {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export class AdminAccessError extends Error {
  readonly status: 400 | 401 | 403 | 413 | 415;

  constructor(status: 400 | 401 | 403 | 413 | 415, message: string) {
    super(message);
    this.name = 'AdminAccessError';
    this.status = status;
  }
}

export class AdminConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminConfigurationError';
  }
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.isBuffer(value) ? value.toString('base64url') : Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function readAdminConfig() {
  try {
    return readAdminAuthEnv();
  } catch (error) {
    if (error instanceof AdminEnvConfigurationError) {
      throw new AdminConfigurationError(error.message);
    }

    throw error;
  }
}

function toCookieMaxAgeSeconds(days: number): number {
  return days * 24 * 60 * 60;
}

function buildAdminSessionSignature(payloadSegment: string, sessionSecret: string): Buffer {
  return createHmac('sha256', sessionSecret).update(payloadSegment).digest();
}

function parseAdminPasswordHash(passwordHash: string): { salt: Buffer; hash: Buffer } {
  const [algorithm, saltSegment, hashSegment] = passwordHash.split('$');

  if (algorithm !== 'scrypt' || !saltSegment || !hashSegment) {
    throw new AdminConfigurationError('ADMIN_PASSWORD_HASH 형식이 올바르지 않습니다.');
  }

  return {
    salt: base64UrlDecode(saltSegment),
    hash: base64UrlDecode(hashSegment),
  };
}

export function isAdminAuthReady(): boolean {
  return isAdminAuthConfigured();
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const normalizedPassword = password.normalize('NFKC');

  if (normalizedPassword.length === 0) {
    return false;
  }

  const { passwordHash } = readAdminConfig();
  const parsedHash = parseAdminPasswordHash(passwordHash);
  const derivedKey = (await scrypt(normalizedPassword, parsedHash.salt, parsedHash.hash.byteLength)) as Buffer;

  return timingSafeEqual(derivedKey, parsedHash.hash);
}

export function createAdminSessionToken(now = Date.now()): string {
  const { sessionSecret, sessionMaxAgeDays } = readAdminConfig();
  const issuedAt = Math.floor(now / 1000);
  const payload: AdminSessionPayload = {
    version: ADMIN_SESSION_VERSION,
    issuedAt,
    expiresAt: issuedAt + toCookieMaxAgeSeconds(sessionMaxAgeDays),
    nonce: base64UrlEncode(randomBytes(18)),
  };
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signatureSegment = base64UrlEncode(buildAdminSessionSignature(payloadSegment, sessionSecret));

  return `${payloadSegment}.${signatureSegment}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  try {
    const { sessionSecret } = readAdminConfig();
    const [payloadSegment, signatureSegment] = token.split('.');

    if (!payloadSegment || !signatureSegment) {
      return null;
    }

    const expectedSignature = buildAdminSessionSignature(payloadSegment, sessionSecret);
    const receivedSignature = base64UrlDecode(signatureSegment);

    if (expectedSignature.byteLength !== receivedSignature.byteLength) {
      return null;
    }

    if (!timingSafeEqual(expectedSignature, receivedSignature)) {
      return null;
    }

    const parsedPayload = JSON.parse(base64UrlDecode(payloadSegment).toString('utf8')) as Partial<AdminSessionPayload>;

    if (
      parsedPayload.version !== ADMIN_SESSION_VERSION ||
      typeof parsedPayload.issuedAt !== 'number' ||
      !Number.isInteger(parsedPayload.issuedAt) ||
      typeof parsedPayload.expiresAt !== 'number' ||
      !Number.isInteger(parsedPayload.expiresAt) ||
      typeof parsedPayload.nonce !== 'string' ||
      parsedPayload.nonce.length === 0
    ) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    if (parsedPayload.expiresAt <= nowSeconds) {
      return null;
    }

    return {
      version: ADMIN_SESSION_VERSION,
      issuedAt: parsedPayload.issuedAt,
      expiresAt: parsedPayload.expiresAt,
      nonce: parsedPayload.nonce,
    };
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(token: string): void {
  const { sessionMaxAgeDays } = readAdminConfig();

  cookies().set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: toCookieMaxAgeSeconds(sessionMaxAgeDays),
  });
}

export function clearAdminSessionCookie(): void {
  cookies().set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

export function getAdminSession(): AdminSessionPayload | null {
  const cookieValue = cookies().get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!cookieValue) {
    return null;
  }

  return verifyAdminSessionToken(cookieValue);
}

export function requireAdmin(): AdminSessionPayload {
  const session = getAdminSession();

  if (session === null) {
    throw new AdminAccessError(401, '관리자 인증이 필요합니다.');
  }

  return session;
}

export function validateSameOriginRequest(request: Request): void {
  const expectedOrigin = new URL(request.url).origin;
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  try {
    const actualOrigin = originHeader ? originHeader.trim() : refererHeader ? new URL(refererHeader).origin : null;

    if (actualOrigin !== expectedOrigin) {
      throw new AdminAccessError(403, '동일 출처 요청만 허용됩니다.');
    }
  } catch {
    throw new AdminAccessError(403, '동일 출처 요청만 허용됩니다.');
  }
}

export function validateJsonRequest(request: Request, maxBytes = 4_096): void {
  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new AdminAccessError(415, 'application/json 요청이 필요합니다.');
  }

  const contentLengthHeader = request.headers.get('content-length');

  if (contentLengthHeader !== null) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);

    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw new AdminAccessError(413, '요청 본문이 허용 크기를 초과했습니다.');
    }
  }
}

export async function readJsonBody<T>(request: Request, maxBytes = 4_096): Promise<T> {
  validateJsonRequest(request, maxBytes);

  try {
    return (await request.json()) as T;
  } catch {
    throw new AdminAccessError(400, '요청 본문이 올바른 JSON 형식이 아닙니다.');
  }
}