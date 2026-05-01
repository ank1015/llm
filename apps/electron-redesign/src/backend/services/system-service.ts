/**
 * Domain service exposing system-level information used by both HTTP routes and
 * IPC handlers. Keeping it framework-agnostic makes it easy to unit test.
 */

const startedAtMs = Date.now();
const startedAtIso = new Date(startedAtMs).toISOString();

export interface UptimeSnapshot {
  readonly uptimeSeconds: number;
  readonly startedAt: string;
}

export const getUptimeSnapshot = (): UptimeSnapshot => ({
  uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
  startedAt: startedAtIso,
});

export const echoMessage = (message: string): { received: string; receivedAt: string } => ({
  received: message,
  receivedAt: new Date().toISOString(),
});
