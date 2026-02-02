import type { ApiErrorResponse } from '@/lib/contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  const error = body.error;
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.message === 'string' ? error.message : undefined;
}

function getOkFlag(body: unknown): boolean | undefined {
  if (!isRecord(body)) {
    return undefined;
  }

  return typeof body.ok === 'boolean' ? body.ok : undefined;
}

function toHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers ?? undefined);
}

export function buildQueryString(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    query.set(key, String(value));
  }

  const encoded = query.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
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

  if (getOkFlag(body) === false) {
    const apiError = body as ApiErrorResponse;
    throw new Error(apiError.error.message);
  }

  return body as TResponse;
}
