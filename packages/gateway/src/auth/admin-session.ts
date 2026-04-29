import { createHash, timingSafeEqual } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import type { GatewayConfig } from '../config.js';

const ADMIN_SESSION_COOKIE = 'llm_gateway_admin';
const ADMIN_SESSION_TTL_SECONDS = 43_200;

export function clearAdminSessionCookie(secure: boolean): string {
  return buildAdminCookie('', secure, 0);
}

export async function createAdminSessionCookie(
  config: GatewayConfig,
  secure: boolean
): Promise<string> {
  const token = await issueAdminSessionToken(config);

  return buildAdminCookie(token, secure, ADMIN_SESSION_TTL_SECONDS);
}

export async function verifyAdminSessionCookie(
  config: GatewayConfig,
  cookieHeader: string | undefined
): Promise<boolean> {
  const token = parseCookie(cookieHeader, ADMIN_SESSION_COOKIE);
  if (!token) {
    return false;
  }

  try {
    const secret = new TextEncoder().encode(config.jwtSecret);
    const result = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    return (
      result.payload.sub === config.adminUsername && result.payload['role'] === 'gateway_admin'
    );
  } catch {
    return false;
  }
}

export function verifyAdminCredentials(
  config: GatewayConfig,
  username: string,
  password: string
): boolean {
  if (!config.adminUsername || !config.adminPassword) {
    return false;
  }

  return safeEqual(username, config.adminUsername) && safeEqual(password, config.adminPassword);
}

export function shouldUseSecureAdminCookie(config: GatewayConfig, request: Request): boolean {
  if (config.cookieSecure === true) {
    return true;
  }

  if (config.cookieSecure === false) {
    return false;
  }

  if (config.trustProxy) {
    const forwardedProto = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim();
    if (forwardedProto) {
      return forwardedProto === 'https';
    }
  }

  return new URL(request.url).protocol === 'https:';
}

async function issueAdminSessionToken(config: GatewayConfig): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(config.jwtSecret);

  return new SignJWT({ role: 'gateway_admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(config.adminUsername ?? 'admin')
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ADMIN_SESSION_TTL_SECONDS)
    .sign(secret);
}

function buildAdminCookie(value: string, secure: boolean, maxAge: number): string {
  const parts = [
    `${ADMIN_SESSION_COOKIE}=${value}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (rawName === name) {
      return rawValue.join('=');
    }
  }

  return undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest();
  const rightHash = createHash('sha256').update(right).digest();

  return timingSafeEqual(leftHash, rightHash);
}
