import { Hono } from 'hono';

import { getUptimeSnapshot } from '../services/system-service.js';

import type { HealthResponse } from '../../shared/api-contract.js';

export const healthRoute = new Hono().get('/', (c) => {
  const snapshot = getUptimeSnapshot();
  const body: HealthResponse = {
    status: 'ok',
    uptimeSeconds: snapshot.uptimeSeconds,
    startedAt: snapshot.startedAt,
  };

  return c.json(body);
});
