import { describe, it, expect } from 'vitest';

import { createApp } from '../src/app.js';

describe('App', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('should return ok status', async () => {
      const res = await app.request('/health');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });
});
