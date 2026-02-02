/**
 * Usage routes
 *
 * Endpoints for /usages/stats and /usages/messages
 */

import { Hono } from 'hono';

import { DbService } from '../services/index.js';

import type { Api } from '@ank1015/llm-types';

const app = new Hono();

/**
 * Build options object with only defined values.
 * This is needed for exactOptionalPropertyTypes compliance.
 */
function buildFilterOptions(params: {
  api: string | undefined;
  modelId: string | undefined;
  startTime: number | undefined;
  endTime: number | undefined;
  limit?: number;
  offset?: number;
}): {
  api?: Api;
  modelId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
} {
  const options: {
    api?: Api;
    modelId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {};

  if (params.api !== undefined) {
    options.api = params.api as Api;
  }
  if (params.modelId !== undefined) {
    options.modelId = params.modelId;
  }
  if (params.startTime !== undefined) {
    options.startTime = params.startTime;
  }
  if (params.endTime !== undefined) {
    options.endTime = params.endTime;
  }
  if (params.limit !== undefined) {
    options.limit = params.limit;
  }
  if (params.offset !== undefined) {
    options.offset = params.offset;
  }

  return options;
}

/**
 * GET /usages/stats
 *
 * Get aggregated usage statistics.
 *
 * Query params:
 * - api: Filter by provider (optional)
 * - modelId: Filter by model (optional)
 * - startTime: Filter by start timestamp in ms (optional)
 * - endTime: Filter by end timestamp in ms (optional)
 */
app.get('/stats', (c) => {
  const api = c.req.query('api');
  const modelId = c.req.query('modelId');
  const startTimeStr = c.req.query('startTime');
  const endTimeStr = c.req.query('endTime');

  const startTime = startTimeStr ? parseInt(startTimeStr, 10) : undefined;
  const endTime = endTimeStr ? parseInt(endTimeStr, 10) : undefined;

  const options = buildFilterOptions({ api, modelId, startTime, endTime });
  const stats = DbService.getUsageStats(options);

  return c.json(stats);
});

/**
 * GET /usages/messages
 *
 * Get paginated message summaries (metadata only).
 *
 * Query params:
 * - api: Filter by provider (optional)
 * - modelId: Filter by model (optional)
 * - startTime: Filter by start timestamp in ms (optional)
 * - endTime: Filter by end timestamp in ms (optional)
 * - limit: Number of messages to return (default: 50, max: 100)
 * - offset: Offset for pagination (default: 0)
 */
app.get('/messages', (c) => {
  const api = c.req.query('api');
  const modelId = c.req.query('modelId');
  const startTimeStr = c.req.query('startTime');
  const endTimeStr = c.req.query('endTime');
  const limitStr = c.req.query('limit');
  const offsetStr = c.req.query('offset');

  const startTime = startTimeStr ? parseInt(startTimeStr, 10) : undefined;
  const endTime = endTimeStr ? parseInt(endTimeStr, 10) : undefined;
  const limit = limitStr ? Math.min(parseInt(limitStr, 10), 100) : 50;
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

  const options = buildFilterOptions({ api, modelId, startTime, endTime, limit, offset });
  const result = DbService.getMessagesSummary(options);

  return c.json(result);
});

export { app as usagesRoutes };
