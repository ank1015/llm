import type { Context } from 'hono';

export function jsonError(c: Context, body: Record<string, unknown>, status: number): Response {
  return createJsonResponse(c, body, status);
}

export function createJsonResponse(c: Context, body: unknown, status = 200): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
  });

  try {
    const requestId = c.get('requestId');
    if (requestId) {
      headers.set('X-Gateway-Request-Id', requestId);
    }
  } catch {
    // Request-id middleware may not have run yet.
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}
