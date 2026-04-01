import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = createApp();
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
