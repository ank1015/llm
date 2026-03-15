import { fetch as expoFetch } from 'expo/fetch';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const DEFAULT_SERVER_PORT = '8001';

type SourceCodeModule = {
  getConstants?: () => {
    scriptURL?: string | null;
  };
};

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/g, '');
}

function getConfiguredServerBase(): string | null {
  const value =
    process.env.EXPO_PUBLIC_LLM_SERVER_BASE_URL ?? process.env.EXPO_PUBLIC_LLM_SERVER_URL;
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

function parseUrlHost(candidate: string | null | undefined): string | null {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(candidate);
    return url.hostname || null;
  } catch {
    return null;
  }
}

function normalizeNativeHost(host: string): string {
  return Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')
    ? '10.0.2.2'
    : host;
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

function getReactNativeBundleServerBase(): string | null {
  if (Platform.OS === 'web') {
    return null;
  }

  const sourceCodeModule = NativeModules.SourceCode as SourceCodeModule | undefined;
  const scriptUrl = sourceCodeModule?.getConstants?.().scriptURL;
  const host = parseUrlHost(scriptUrl);

  if (!host) {
    return null;
  }

  return `http://${normalizeNativeHost(host)}:${DEFAULT_SERVER_PORT}`;
}

function getExpoDevServerBase(): string | null {
  const expoGoConfig = Constants.expoGoConfig as { debuggerHost?: string; logUrl?: string } | null;
  const host =
    parseHost(Constants.expoConfig?.hostUri) ??
    parseHost(expoGoConfig?.debuggerHost) ??
    parseUrlHost(expoGoConfig?.logUrl);

  if (!host) {
    return null;
  }

  return `http://${normalizeNativeHost(host)}:${DEFAULT_SERVER_PORT}`;
}

export function resolveServerBaseUrl(): string {
  return (
    getConfiguredServerBase() ??
    getReactNativeBundleServerBase() ??
    getExpoDevServerBase() ??
    getWebServerBase() ??
    (Platform.OS === 'android'
      ? `http://10.0.2.2:${DEFAULT_SERVER_PORT}`
      : `http://localhost:${DEFAULT_SERVER_PORT}`)
  );
}

export const SERVER_BASE = resolveServerBaseUrl();
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
