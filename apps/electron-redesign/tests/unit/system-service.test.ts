import { describe, expect, it } from 'vitest';

import { echoMessage, getUptimeSnapshot } from '../../src/backend/services/system-service.js';

describe('system-service', () => {
  describe('getUptimeSnapshot', () => {
    it('returns a non-negative uptime and an ISO timestamp', () => {
      const snapshot = getUptimeSnapshot();

      expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(() => new Date(snapshot.startedAt).toISOString()).not.toThrow();
    });
  });

  describe('echoMessage', () => {
    it('echoes the input verbatim with a fresh timestamp', () => {
      const before = Date.now();
      const result = echoMessage('hello');
      const after = Date.now();

      expect(result.received).toBe('hello');

      const at = Date.parse(result.receivedAt);
      expect(at).toBeGreaterThanOrEqual(before);
      expect(at).toBeLessThanOrEqual(after);
    });
  });
});
