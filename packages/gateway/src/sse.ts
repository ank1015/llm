export const HEARTBEAT_INTERVAL_MS = 15_000;

export const SSE_HEADERS = {
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'Content-Type': 'text/event-stream; charset=utf-8',
  'X-Accel-Buffering': 'no',
} as const;

export function toSseDataFrame(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function toSseCommentFrame(comment: string): Uint8Array {
  return new TextEncoder().encode(`: ${comment}\n\n`);
}
