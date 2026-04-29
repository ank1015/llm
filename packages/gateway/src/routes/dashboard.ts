import { Hono } from 'hono';

import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  shouldUseSecureAdminCookie,
  verifyAdminCredentials,
} from '../auth/admin-session.js';
import { hashPassword } from '../auth/passwords.js';
import { consumeRateLimit } from '../middleware/rate-limit.js';
import { parseAzureOpenAIDeploymentUrl } from '../proxy/llm.js';
import { isGatewayApi } from '../vault/provider-key-vault.js';

import { renderLoginPage } from './dashboard/pages/login.js';
import { renderOverviewPage } from './dashboard/pages/overview.js';
import { renderProvidersPage } from './dashboard/pages/providers.js';
import { renderRequestDetailPage, renderRequestsListPage } from './dashboard/pages/requests.js';
import { renderUsersPage } from './dashboard/pages/users.js';
import {
  ADMIN_DASHBOARD_PATH,
  ADMIN_LOGIN_PATH,
  getFormValue,
  hasAdminSession,
  redirectIfMissingSession,
} from './dashboard/session.js';

import type { GatewayEnv } from '../context.js';

const USER_NOT_FOUND_MESSAGE = 'User not found.';

export function createDashboardRoutes(): Hono<GatewayEnv> {
  const routes = new Hono<GatewayEnv>();

  routes.get('/admin', async (c) => {
    if (await hasAdminSession(c)) {
      return c.redirect(ADMIN_DASHBOARD_PATH);
    }
    return c.redirect(ADMIN_LOGIN_PATH);
  });

  routes.get(ADMIN_LOGIN_PATH, (c) => {
    return c.html(renderLoginPage(c.get('services').config.adminUsername === undefined));
  });

  routes.post(ADMIN_LOGIN_PATH, async (c) => {
    const config = c.get('services').config;
    const rateLimit = consumeRateLimit(c, 'login');
    if (!rateLimit.allowed) {
      c.header('Retry-After', String(rateLimit.retryAfterSeconds));
      return c.html(
        renderLoginPage(false, 'Too many login attempts. Please try again later.'),
        429
      );
    }

    if (!config.adminUsername || !config.adminPassword) {
      return c.html(renderLoginPage(true, 'Admin login is not configured on this gateway.'), 503);
    }

    const body = await c.req.parseBody();
    const username = getFormValue(body, 'username');
    const password = getFormValue(body, 'password');
    if (!verifyAdminCredentials(config, username, password)) {
      return c.html(renderLoginPage(false, 'Invalid username or password.'), 401);
    }

    c.header(
      'Set-Cookie',
      await createAdminSessionCookie(config, shouldUseSecureAdminCookie(config, c.req.raw))
    );
    return c.redirect(ADMIN_DASHBOARD_PATH, 303);
  });

  routes.post('/admin/logout', (c) => {
    const config = c.get('services').config;
    c.header('Set-Cookie', clearAdminSessionCookie(shouldUseSecureAdminCookie(config, c.req.raw)));
    return c.redirect(ADMIN_LOGIN_PATH, 303);
  });

  routes.get(ADMIN_DASHBOARD_PATH, async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    return c.html(renderOverviewPage(c, c.req.query()));
  });

  routes.get('/admin/dashboard/requests', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    return c.html(renderRequestsListPage(c, c.req.query()));
  });

  routes.get('/admin/dashboard/requests/:id', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const result = renderRequestDetailPage(c, c.req.param('id'));
    return c.html(result.html, result.status as 200 | 404);
  });

  routes.get('/admin/dashboard/users', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    return c.html(renderUsersPage(c));
  });

  routes.post('/admin/dashboard/users', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const body = await c.req.parseBody();
    const username = getFormValue(body, 'username').trim();
    const password = getFormValue(body, 'password');
    const name = getFormValue(body, 'name').trim() || username;

    if (!username || password.length < 8) {
      return c.html(
        renderUsersPage(c, {
          kind: 'error',
          text: 'Username is required and password must be at least 8 characters.',
        }),
        400
      );
    }

    if (c.get('services').db.getSenderByUsername(username)) {
      return c.html(
        renderUsersPage(c, {
          kind: 'error',
          text: 'That username already exists.',
        }),
        409
      );
    }

    c.get('services').db.createSender({
      name,
      username,
      passwordHash: await hashPassword(password),
    });

    return c.html(
      renderUsersPage(c, {
        kind: 'success',
        text: `Created user "${username}".`,
      }),
      201
    );
  });

  routes.post('/admin/dashboard/users/:id/disable', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const senderId = c.req.param('id');
    const services = c.get('services');
    const sender = services.db.getSenderById(senderId);
    if (!sender) {
      return c.html(renderUsersPage(c, { kind: 'error', text: USER_NOT_FOUND_MESSAGE }), 404);
    }

    services.db.setSenderDisabled(senderId, Date.now());
    services.db.revokeRefreshTokensBySender(senderId);

    return c.html(
      renderUsersPage(c, {
        kind: 'success',
        text: `Disabled "${sender.username ?? sender.name}" and revoked active sessions.`,
      })
    );
  });

  routes.post('/admin/dashboard/users/:id/enable', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const senderId = c.req.param('id');
    const services = c.get('services');
    const sender = services.db.getSenderById(senderId);
    if (!sender) {
      return c.html(renderUsersPage(c, { kind: 'error', text: USER_NOT_FOUND_MESSAGE }), 404);
    }

    services.db.setSenderDisabled(senderId, null);

    return c.html(
      renderUsersPage(c, {
        kind: 'success',
        text: `Re-enabled "${sender.username ?? sender.name}".`,
      })
    );
  });

  routes.post('/admin/dashboard/users/:id/revoke-sessions', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const senderId = c.req.param('id');
    const services = c.get('services');
    const sender = services.db.getSenderById(senderId);
    if (!sender) {
      return c.html(renderUsersPage(c, { kind: 'error', text: USER_NOT_FOUND_MESSAGE }), 404);
    }

    const revoked = services.db.revokeRefreshTokensBySender(senderId);

    return c.html(
      renderUsersPage(c, {
        kind: 'success',
        text: `Revoked ${revoked} active session${revoked === 1 ? '' : 's'} for "${sender.username ?? sender.name}".`,
      })
    );
  });

  routes.get('/admin/dashboard/providers', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    return c.html(renderProvidersPage(c));
  });

  routes.post('/admin/dashboard/providers', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const body = await c.req.parseBody();
    const api = getFormValue(body, 'api').trim();
    const apiKey = getFormValue(body, 'apiKey');
    const azureDeploymentUrl = getFormValue(body, 'azureDeploymentUrl').trim();
    const azureDeploymentName = getFormValue(body, 'azureDeploymentName').trim();
    if (!isGatewayApi(api) || !apiKey.trim()) {
      return c.html(
        renderProvidersPage(c, {
          kind: 'error',
          text: 'Choose a supported provider and paste a non-empty API key.',
        }),
        400
      );
    }

    if (api === 'azure-openai') {
      if (!azureDeploymentUrl) {
        return c.html(
          renderProvidersPage(c, {
            kind: 'error',
            text: 'Azure OpenAI requires a deployment URL.',
          }),
          400
        );
      }

      try {
        parseAzureOpenAIDeploymentUrl(azureDeploymentUrl);
      } catch {
        return c.html(
          renderProvidersPage(c, {
            kind: 'error',
            text: 'Azure OpenAI deployment URL must be a valid /openai/responses URL.',
          }),
          400
        );
      }

      c.get('services').vault.setProviderCredentials(api, {
        apiKey: apiKey.trim(),
        azureDeploymentUrl,
        ...(azureDeploymentName ? { azureDeploymentName } : {}),
      });
    } else {
      c.get('services').vault.setApiKey(api, apiKey.trim());
    }

    return c.html(
      renderProvidersPage(c, {
        kind: 'success',
        text: `Stored credentials for ${api}. Secrets are encrypted and never shown again.`,
      })
    );
  });

  return routes;
}
