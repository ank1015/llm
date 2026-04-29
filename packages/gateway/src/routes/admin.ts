import { Hono } from 'hono';

import { hashPassword } from '../auth/passwords.js';
import { GatewayAuthError } from '../auth/tokens.js';
import {
  AdminRequestsQuerySchema,
  AdminUsageQuerySchema,
  CreateSenderBodySchema,
  StoreProviderKeyBodySchema,
} from '../contracts/index.js';
import { jsonError } from '../http/response.js';
import { readJsonBody, validateSchema } from '../http/validation.js';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { parseAzureOpenAIDeploymentUrl } from '../proxy/llm.js';
import { isGatewayApi } from '../vault/provider-key-vault.js';

import type { GatewayEnv } from '../context.js';

export function createAdminRoutes(): Hono<GatewayEnv> {
  const routes = new Hono<GatewayEnv>();

  routes.use('/admin/*', adminAuthMiddleware());

  routes.post('/admin/senders', async (c) => {
    const rawBody = await readJsonBody(c, c.get('services').config.maxRequestBodyBytes);
    const validation = validateSchema(c, CreateSenderBodySchema, rawBody, 'name is required.');
    if (!validation.ok) {
      return validation.response;
    }

    if (
      (validation.value.username && !validation.value.password) ||
      (!validation.value.username && validation.value.password)
    ) {
      return c.json({ error: 'username and password must be provided together.' }, 400);
    }

    const name = validation.value.name.trim();
    const sender = validation.value.username
      ? c.get('services').db.createSender({
          name,
          username: validation.value.username.trim(),
          passwordHash: await hashPassword(validation.value.password ?? ''),
        })
      : c.get('services').db.createSender({ name });
    return c.json({ sender });
  });

  routes.post('/admin/senders/:id/tokens', async (c) => {
    try {
      const tokens = await c.get('services').auth.issueTokenPair(c.req.param('id'));
      return c.json(tokens);
    } catch (error) {
      if (error instanceof GatewayAuthError) {
        return jsonError(c, { error: error.message, code: error.code }, error.status);
      }

      return c.json({ error: 'Failed to issue tokens.' }, 500);
    }
  });

  routes.delete('/admin/refresh-tokens/:id', (c) => {
    const revoked = c.get('services').db.revokeRefreshTokenById(c.req.param('id'));
    return c.json({ ok: true, revoked });
  });

  routes.put('/admin/providers/:api/key', async (c) => {
    const api = c.req.param('api');
    if (!isGatewayApi(api)) {
      return c.json({ error: `Unsupported gateway provider "${api}".` }, 400);
    }

    const rawBody = await readJsonBody(c, c.get('services').config.maxRequestBodyBytes);
    const validation = validateSchema(
      c,
      StoreProviderKeyBodySchema,
      rawBody,
      'apiKey is required.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    if (api === 'azure-openai') {
      if (!validation.value.azureDeploymentUrl) {
        return c.json({ error: 'azureDeploymentUrl is required for azure-openai.' }, 400);
      }

      try {
        parseAzureOpenAIDeploymentUrl(validation.value.azureDeploymentUrl);
      } catch {
        return c.json({ error: 'azureDeploymentUrl must be a valid Azure OpenAI URL.' }, 400);
      }

      c.get('services').vault.setProviderCredentials(api, {
        apiKey: validation.value.apiKey,
        azureDeploymentUrl: validation.value.azureDeploymentUrl,
        ...(validation.value.azureDeploymentName
          ? { azureDeploymentName: validation.value.azureDeploymentName }
          : {}),
      });
      return c.json({ ok: true, api });
    }

    c.get('services').vault.setApiKey(api, validation.value.apiKey);
    return c.json({ ok: true, api });
  });

  routes.get('/admin/requests', (c) => {
    const validation = validateSchema(
      c,
      AdminRequestsQuerySchema,
      c.req.query(),
      'Invalid request query.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    const filters = parseFilters(validation.value);
    if (!filters.ok) {
      return c.json({ error: filters.error }, 400);
    }

    const requests = c
      .get('services')
      .db.listRequests(filters.value)
      .map((request) => omitLargePayloads(request));

    return c.json({
      requests,
      configuredProviders: c.get('services').vault.listConfiguredApis(),
    });
  });

  routes.get('/admin/requests/:id', (c) => {
    const request = c.get('services').db.getRequestById(c.req.param('id'));
    if (!request) {
      return c.json({ error: 'Request not found.' }, 404);
    }

    return c.json({
      request: {
        ...request.request,
        input: parseStoredJson(request.request.inputJson),
        output: parseStoredJson(request.request.outputJson),
      },
      events: request.events.map((event) => ({
        requestId: event.requestId,
        seq: event.seq,
        timestamp: event.timestamp,
        event: parseStoredJson(event.eventJson),
      })),
    });
  });

  routes.get('/admin/usage', (c) => {
    const validation = validateSchema(
      c,
      AdminUsageQuerySchema,
      c.req.query(),
      'Invalid usage query.'
    );
    if (!validation.ok) {
      return validation.response;
    }

    const filters = parseFilters(validation.value);
    if (!filters.ok) {
      return c.json({ error: filters.error }, 400);
    }

    return c.json({
      summary: c.get('services').db.getUsageSummary(filters.value),
      filters: filters.value,
    });
  });

  return routes;
}

function omitLargePayloads<T extends { inputJson: string | null; outputJson: string | null }>(
  request: T
): Omit<T, 'inputJson' | 'outputJson'> {
  const { inputJson: _inputJson, outputJson: _outputJson, ...summary } = request;
  return summary;
}

function parseFilters(query: { from?: string; limit?: string; senderId?: string; to?: string }):
  | {
      ok: true;
      value: { from?: number; limit?: number; senderId?: string; to?: number };
    }
  | { ok: false; error: string } {
  const from = parseOptionalInteger(query.from, 'from');
  if (!from.ok) {
    return from;
  }

  const to = parseOptionalInteger(query.to, 'to');
  if (!to.ok) {
    return to;
  }

  const limit = parseOptionalInteger(query.limit, 'limit');
  if (!limit.ok) {
    return limit;
  }

  return {
    ok: true,
    value: {
      ...(query.senderId ? { senderId: query.senderId } : {}),
      ...(from.value !== undefined ? { from: from.value } : {}),
      ...(to.value !== undefined ? { to: to.value } : {}),
      ...(limit.value !== undefined ? { limit: limit.value } : {}),
    },
  };
}

function parseOptionalInteger(
  value: string | undefined,
  name: string
): { ok: true; value?: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      ok: false,
      error: `${name} must be a non-negative integer.`,
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}

function parseStoredJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
