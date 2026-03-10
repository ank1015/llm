import { fetch as expoFetch } from 'expo/fetch';
import Constants from 'expo-constants';

const DEFAULT_SERVER_PORT = '8001';
const DEFAULT_SERVER_BASE = `http://localhost:${DEFAULT_SERVER_PORT}`;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/g, '');
}

function getConfiguredServerBase(): string | null {
  const configured = process.env.EXPO_PUBLIC_LLM_SERVER_BASE_URL?.trim();
  return configured ? normalizeBaseUrl(configured) : null;
}

function getMetroHostServerBase(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.platform?.hostUri;
  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(':')[0]?.trim();
  if (!host) {
    return null;
  }

  return `http://${host}:${DEFAULT_SERVER_PORT}`;
}

export const SERVER_BASE =
  getConfiguredServerBase() ?? getMetroHostServerBase() ?? DEFAULT_SERVER_BASE;
export const apiFetch = expoFetch as typeof globalThis.fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  // Server returns { error: "message" } (string) on errors
  if (typeof body.error === 'string') {
    return body.error;
  }

  // Legacy format: { error: { message: "..." } }
  const error = body.error;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return undefined;
}

function toHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers ?? undefined);
}

export async function apiRequestJson<TResponse>(
  url: string,
  init?: RequestInit
): Promise<TResponse> {
  const headers = toHeaders(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await apiFetch(url, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(body) ?? `Request failed: ${response.status}`);
  }

  return body as TResponse;
}
