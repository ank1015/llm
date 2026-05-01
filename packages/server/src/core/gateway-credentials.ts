import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import type { GatewayLoginResult, GatewaySession } from '../contracts/index.js';

const hostedGatewayBaseUrl = 'https://d2tc9xfixu2w29.cloudfront.net';

type GatewayCredentials = {
  readonly gatewayBaseUrl: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt?: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt?: number;
  readonly refreshTokenId?: string;
  readonly savedAt: string;
};

type GatewayLoginResponse = {
  readonly accessToken: string;
  readonly accessTokenExpiresAt?: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt?: number;
  readonly refreshTokenId?: string;
};

export const getGatewaySession = async (): Promise<GatewaySession> => {
  const credentials = await readGatewayCredentials();

  if (!credentials) {
    return createAnonymousSession();
  }

  return {
    authenticated: true,
    credentialsPath: getGatewayCredentialsPath(),
    gatewayBaseUrl: credentials.gatewayBaseUrl,
    savedAt: credentials.savedAt,
    ...(credentials.accessTokenExpiresAt
      ? { accessTokenExpiresAt: credentials.accessTokenExpiresAt }
      : {}),
    ...(credentials.refreshTokenExpiresAt
      ? { refreshTokenExpiresAt: credentials.refreshTokenExpiresAt }
      : {}),
  };
};

export const loginGateway = async (
  username: string,
  password: string
): Promise<GatewayLoginResult> => {
  const cleanUsername = username.trim();

  if (!cleanUsername || !password) {
    return {
      ok: false,
      message: 'Username and password are required.',
      session: await getGatewaySession(),
    };
  }

  try {
    const tokenPair = await requestGatewayLogin(cleanUsername, password);
    const credentials: GatewayCredentials = {
      gatewayBaseUrl: getGatewayBaseUrl(),
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      savedAt: new Date().toISOString(),
      ...(tokenPair.accessTokenExpiresAt
        ? { accessTokenExpiresAt: tokenPair.accessTokenExpiresAt }
        : {}),
      ...(tokenPair.refreshTokenExpiresAt
        ? { refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt }
        : {}),
      ...(tokenPair.refreshTokenId ? { refreshTokenId: tokenPair.refreshTokenId } : {}),
    };

    await writeGatewayCredentials(credentials);

    return {
      ok: true,
      session: await getGatewaySession(),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Failed to log in.',
      session: await getGatewaySession(),
    };
  }
};

const createAnonymousSession = (): GatewaySession => ({
  authenticated: false,
  credentialsPath: getGatewayCredentialsPath(),
  gatewayBaseUrl: getGatewayBaseUrl(),
});

const getGatewayBaseUrl = (): string =>
  process.env['LLM_GATEWAY_BASE_URL']?.trim().replace(/\/+$/, '') || hostedGatewayBaseUrl;

const getGatewayCredentialsPath = (): string => join(homedir(), '.llm', 'gateway.json');

const readGatewayCredentials = async (): Promise<GatewayCredentials | null> => {
  try {
    const raw = await readFile(getGatewayCredentialsPath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (isGatewayCredentials(parsed)) {
      return parsed;
    }

    return null;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const writeGatewayCredentials = async (credentials: GatewayCredentials): Promise<void> => {
  const credentialsPath = getGatewayCredentialsPath();

  await mkdir(dirname(credentialsPath), { recursive: true, mode: 0o700 });
  await writeFile(credentialsPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    mode: 0o600,
  });
};

const requestGatewayLogin = async (
  username: string,
  password: string
): Promise<GatewayLoginResponse> => {
  const response = await fetch(`${getGatewayBaseUrl()}/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(readGatewayError(body) || `Gateway login failed with HTTP ${response.status}.`);
  }

  if (!isGatewayLoginResponse(body)) {
    throw new Error('Gateway login returned an unexpected response.');
  }

  return body;
};

const isGatewayLoginResponse = (value: unknown): value is GatewayLoginResponse => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value['accessToken'] === 'string' && typeof value['refreshToken'] === 'string';
};

const isGatewayCredentials = (value: unknown): value is GatewayCredentials => {
  if (!isRecord(value)) {
    return false;
  }

  const hasTokenPair = isGatewayLoginResponse(value);
  const hasMetadata =
    typeof value['gatewayBaseUrl'] === 'string' && typeof value['savedAt'] === 'string';

  return hasTokenPair && hasMetadata;
};

const readGatewayError = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  const message = value['error'] ?? value['message'];

  return typeof message === 'string' && message.trim() ? message : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNodeError = (value: unknown): value is NodeJS.ErrnoException =>
  value instanceof Error && 'code' in value;
