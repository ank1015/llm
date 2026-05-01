const LOCAL_SERVER_BASE = 'http://localhost:8001';

function getDefaultServerBaseUrl(): string {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') {
    return LOCAL_SERVER_BASE;
  }

  return window.location.origin;
}

export function resolveServerBaseUrl(
  rawBase = process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL
): string {
  const trimmed = rawBase?.trim();
  if (!trimmed) {
    return getDefaultServerBaseUrl();
  }

  return trimmed.replace(/\/+$/, '');
}

export const SERVER_BASE = resolveServerBaseUrl();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  if (typeof body.error === 'string') {
    return body.error;
  }

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

  const response = await fetch(url, {
    ...init,
    headers,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      response.ok ? `Expected JSON response from ${url}` : `Request failed: ${response.status}`
    );
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(body) ?? `Request failed: ${response.status}`);
  }

  return body as TResponse;
}

export function toWebSocketUrl(url: string): string {
  const socketUrl = new URL(url);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return socketUrl.toString();
}
