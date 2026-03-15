const DEFAULT_SERVER_BASE = 'http://localhost:8001';

export function resolveServerBaseUrl(
  rawBase = process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL
): string {
  const trimmed = rawBase?.trim();
  if (!trimmed) {
    return DEFAULT_SERVER_BASE;
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

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const body = (await response.json().catch(() => ({}))) as unknown;

  if (!response.ok) {
    throw new Error(getErrorMessage(body) ?? `Request failed: ${response.status}`);
  }

  return body as TResponse;
}
