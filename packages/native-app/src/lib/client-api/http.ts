import { fetch as expoFetch } from 'expo/fetch';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_SERVER_PORT = '8001';

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/g, '');
}

function getConfiguredServerBase(): string | null {
  const value =
    process.env.EXPO_PUBLIC_LLM_SERVER_URL ??
    process.env.EXPO_PUBLIC_SERVER_URL ??
    Constants.expoConfig?.extra?.serverUrl;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  return normalizeBaseUrl(value);
}

function parseHost(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return null;
  }

  const [host] = candidate.trim().split(':');
  return host?.trim().length ? host.trim() : null;
}

function getWebServerBase(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const host = parseHost(window.location.hostname);
  if (!host) {
    return null;
  }

  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${host}:${DEFAULT_SERVER_PORT}`;
}

function getExpoDevServerBase(): string | null {
  const host =
    parseHost(Constants.expoConfig?.hostUri) ?? parseHost(Constants.expoGoConfig?.debuggerHost);

  if (!host) {
    return null;
  }

  const normalizedHost =
    Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1') ? '10.0.2.2' : host;

  return `http://${normalizedHost}:${DEFAULT_SERVER_PORT}`;
}

function resolveServerBase(): string {
  return (
    getConfiguredServerBase() ??
    getExpoDevServerBase() ??
    getWebServerBase() ??
    (Platform.OS === 'android'
      ? `http://10.0.2.2:${DEFAULT_SERVER_PORT}`
      : `http://localhost:${DEFAULT_SERVER_PORT}`)
  );
}

export const SERVER_BASE = resolveServerBase();
export const apiFetch = expoFetch;

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
