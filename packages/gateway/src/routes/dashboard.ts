import { Hono } from 'hono';

import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  verifyAdminCredentials,
  verifyAdminSessionCookie,
} from '../auth/admin-session.js';
import { hashPassword } from '../auth/passwords.js';
import { isGatewayApi, SupportedGatewayApis } from '../vault/provider-key-vault.js';

import type { GatewayEnv } from '../context.js';
import type { RequestRecord, SenderRecord } from '../db/index.js';
import type { Context } from 'hono';

type DashboardMessage = {
  kind: 'error' | 'success';
  text: string;
};

const ADMIN_DASHBOARD_PATH = '/admin/dashboard';
const ADMIN_LOGIN_PATH = '/admin/login';

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
    if (!config.adminUsername || !config.adminPassword) {
      return c.html(renderLoginPage(true, 'Admin login is not configured on this gateway.'), 503);
    }

    const body = await c.req.parseBody();
    const username = getFormValue(body, 'username');
    const password = getFormValue(body, 'password');
    if (!verifyAdminCredentials(config, username, password)) {
      return c.html(renderLoginPage(false, 'Invalid username or password.'), 401);
    }

    c.header('Set-Cookie', await createAdminSessionCookie(config));
    return c.redirect(ADMIN_DASHBOARD_PATH, 303);
  });

  routes.post('/admin/logout', (c) => {
    c.header('Set-Cookie', clearAdminSessionCookie());
    return c.redirect(ADMIN_LOGIN_PATH, 303);
  });

  routes.get(ADMIN_DASHBOARD_PATH, async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    return c.html(renderDashboard(c));
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
        renderDashboard(c, {
          kind: 'error',
          text: 'Username is required and password must be at least 8 characters.',
        }),
        400
      );
    }

    if (c.get('services').db.getSenderByUsername(username)) {
      return c.html(
        renderDashboard(c, {
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
      renderDashboard(c, {
        kind: 'success',
        text: `Created user "${username}".`,
      }),
      201
    );
  });

  routes.post('/admin/dashboard/providers', async (c) => {
    const redirect = await redirectIfMissingSession(c);
    if (redirect) {
      return redirect;
    }

    const body = await c.req.parseBody();
    const api = getFormValue(body, 'api').trim();
    const apiKey = getFormValue(body, 'apiKey');
    if (!isGatewayApi(api) || !apiKey.trim()) {
      return c.html(
        renderDashboard(c, {
          kind: 'error',
          text: 'Choose a supported provider and paste a non-empty API key.',
        }),
        400
      );
    }

    c.get('services').vault.setApiKey(api, apiKey.trim());

    return c.html(
      renderDashboard(c, {
        kind: 'success',
        text: `Stored key for ${api}. The key is encrypted and never shown again.`,
      })
    );
  });

  return routes;
}

async function redirectIfMissingSession(c: Context<GatewayEnv>): Promise<Response | undefined> {
  if (await hasAdminSession(c)) {
    return undefined;
  }

  return c.redirect(ADMIN_LOGIN_PATH, 303);
}

async function hasAdminSession(c: Context<GatewayEnv>): Promise<boolean> {
  return verifyAdminSessionCookie(c.get('services').config, c.req.header('Cookie') ?? undefined);
}

function getFormValue(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (Array.isArray(value)) {
    return stringifyFormValue(value[0]);
  }

  return stringifyFormValue(value);
}

function stringifyFormValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function renderLoginPage(missingConfig: boolean, error?: string): string {
  const message = missingConfig
    ? 'Set GATEWAY_ADMIN_USERNAME and GATEWAY_ADMIN_PASSWORD to enable browser login.'
    : error;

  return renderPage({
    body: `
      <main class="login-card">
        <p class="eyebrow">LLM Gateway</p>
        <h1>Admin login</h1>
        <p class="muted">Sign in to create users, store provider keys, and inspect gateway activity.</p>
        ${message ? renderNotice({ kind: missingConfig ? 'error' : 'error', text: message }) : ''}
        <form method="post" action="/admin/login" class="stack">
          <label>
            <span>Username</span>
            <input name="username" autocomplete="username" required />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required />
          </label>
          <button type="submit">Enter dashboard</button>
        </form>
      </main>
    `,
    title: 'Gateway Admin Login',
  });
}

function renderDashboard(c: Context<GatewayEnv>, message?: DashboardMessage): string {
  const services = c.get('services');
  const senders = services.db.listSenders();
  const requests = services.db.listRequests({ limit: 20 });
  const usage = services.db.getUsageSummary();
  const configuredProviders = services.vault.listConfiguredApis();

  return renderPage({
    body: `
      <main class="shell">
        <header class="hero">
          <div>
            <p class="eyebrow">LLM Gateway</p>
            <h1>Admin dashboard</h1>
            <p class="muted">Create approved users, keep keys server-side, and watch the request trail.</p>
          </div>
          <form method="post" action="/admin/logout">
            <button class="secondary" type="submit">Log out</button>
          </form>
        </header>
        ${message ? renderNotice(message) : ''}
        <section class="grid metrics">
          ${renderMetric('Users', senders.length.toString())}
          ${renderMetric('Requests', usage.requestCount.toString())}
          ${renderMetric('Tokens', usage.totalTokens.toString())}
          ${renderMetric('Cost', formatUsd(usage.costUsd))}
        </section>
        <section class="grid two">
          ${renderCreateUserPanel()}
          ${renderProviderPanel(configuredProviders)}
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Users</h2>
              <p class="muted">Only users created here can log in for access and refresh tokens.</p>
            </div>
          </div>
          ${renderUsersTable(senders)}
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>Recent requests</h2>
              <p class="muted">Sanitized payloads remain available from the admin JSON API.</p>
            </div>
          </div>
          ${renderRequestsTable(requests)}
        </section>
      </main>
    `,
    title: 'Gateway Admin Dashboard',
  });
}

function renderCreateUserPanel(): string {
  return `
    <section class="panel">
      <h2>Create user</h2>
      <p class="muted">The user can call <code>POST /v1/auth/login</code> to receive tokens.</p>
      <form method="post" action="/admin/dashboard/users" class="stack">
        <label>
          <span>Display name</span>
          <input name="name" placeholder="Test Pilot" />
        </label>
        <label>
          <span>Username</span>
          <input name="username" autocomplete="off" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" minlength="8" autocomplete="new-password" required />
        </label>
        <button type="submit">Create user</button>
      </form>
    </section>
  `;
}

function renderProviderPanel(configuredProviders: string[]): string {
  return `
    <section class="panel">
      <h2>Provider keys</h2>
      <p class="muted">Keys are encrypted at rest and never rendered back to the browser.</p>
      <form method="post" action="/admin/dashboard/providers" class="stack">
        <label>
          <span>Provider</span>
          <select name="api">
            ${SupportedGatewayApis.map((api) => `<option value="${api}">${api}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>API key</span>
          <input name="apiKey" type="password" autocomplete="off" required />
        </label>
        <button type="submit">Store key</button>
      </form>
      <p class="chips">
        ${configuredProviders.length > 0 ? configuredProviders.map(renderChip).join('') : '<span class="muted">No providers configured yet.</span>'}
      </p>
    </section>
  `;
}

function renderUsersTable(senders: SenderRecord[]): string {
  if (senders.length === 0) {
    return '<p class="empty">No users yet.</p>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${senders
            .map(
              (sender) => `
                <tr>
                  <td>${escapeHtml(sender.name)}</td>
                  <td>${sender.username ? escapeHtml(sender.username) : '<span class="muted">sender only</span>'}</td>
                  <td>${sender.disabledAt === null ? 'enabled' : 'disabled'}</td>
                  <td>${formatDate(sender.createdAt)}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRequestsTable(requests: RequestRecord[]): string {
  if (requests.length === 0) {
    return '<p class="empty">No requests have flowed through this gateway yet.</p>';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Sender</th>
            <th>Model</th>
            <th>Status</th>
            <th>Cost</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          ${requests
            .map(
              (request) => `
                <tr>
                  <td><code>${escapeHtml(request.id.slice(0, 8))}</code></td>
                  <td><code>${escapeHtml(request.senderId.slice(0, 8))}</code></td>
                  <td>${escapeHtml(`${request.api}/${request.modelId}`)}</td>
                  <td>${escapeHtml(request.status)}</td>
                  <td>${formatUsd(request.costUsd ?? 0)}</td>
                  <td>${formatDate(request.startedAt)}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderMetric(label: string, value: string): string {
  return `
    <article class="metric panel">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderNotice(message: DashboardMessage): string {
  return `<p class="notice ${message.kind}">${escapeHtml(message.text)}</p>`;
}

function renderChip(value: string): string {
  return `<span class="chip">${escapeHtml(value)}</span>`;
}

function renderPage(input: { body: string; title: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5efe4;
      --ink: #221b14;
      --muted: #75695c;
      --panel: rgba(255, 250, 241, 0.88);
      --line: rgba(75, 54, 34, 0.16);
      --accent: #b8471b;
      --accent-ink: #fffaf1;
      --good: #1d7a4f;
      --bad: #b3261e;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 15% 10%, rgba(184, 71, 27, 0.24), transparent 28rem),
        radial-gradient(circle at 90% 0%, rgba(30, 102, 95, 0.18), transparent 24rem),
        linear-gradient(135deg, #fbf4e8, var(--bg));
      font-family: Charter, "Iowan Old Style", Georgia, serif;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      border: 0;
      border-radius: 999px;
      padding: 0.78rem 1.15rem;
      color: var(--accent-ink);
      background: var(--accent);
      cursor: pointer;
      font-weight: 700;
    }

    button.secondary {
      color: var(--ink);
      background: transparent;
      border: 1px solid var(--line);
    }

    code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.9em;
    }

    h1,
    h2,
    p {
      margin-top: 0;
    }

    h1 {
      font-size: clamp(2.4rem, 7vw, 5.8rem);
      line-height: 0.9;
      letter-spacing: -0.06em;
      margin-bottom: 1rem;
    }

    h2 {
      margin-bottom: 0.55rem;
    }

    input,
    select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 1rem;
      padding: 0.82rem 0.9rem;
      background: rgba(255, 255, 255, 0.72);
      color: var(--ink);
    }

    label span {
      display: block;
      margin-bottom: 0.35rem;
      color: var(--muted);
      font-size: 0.92rem;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.78rem;
      text-align: left;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font-weight: 600;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 1rem 0 0;
    }

    .chip {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 0.32rem 0.68rem;
      background: rgba(255, 255, 255, 0.55);
    }

    .empty {
      color: var(--muted);
      margin-bottom: 0;
    }

    .eyebrow {
      margin-bottom: 0.7rem;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }

    .grid {
      display: grid;
      gap: 1rem;
    }

    .hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.2rem;
    }

    .login-card,
    .shell {
      width: min(1120px, calc(100% - 2rem));
      margin: 0 auto;
      padding: 2rem 0;
    }

    .login-card {
      max-width: 460px;
      padding-top: 12vh;
    }

    .metric span {
      display: block;
      color: var(--muted);
      margin-bottom: 0.45rem;
    }

    .metric strong {
      display: block;
      font-size: 2rem;
      letter-spacing: -0.04em;
    }

    .metrics {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 1rem;
    }

    .muted {
      color: var(--muted);
    }

    .notice {
      border-radius: 1rem;
      padding: 0.85rem 1rem;
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid var(--line);
    }

    .notice.error {
      color: var(--bad);
      border-color: rgba(179, 38, 30, 0.35);
    }

    .notice.success {
      color: var(--good);
      border-color: rgba(29, 122, 79, 0.32);
    }

    .panel {
      border: 1px solid var(--line);
      border-radius: 1.4rem;
      padding: 1.1rem;
      background: var(--panel);
      box-shadow: 0 24px 60px rgba(63, 42, 20, 0.08);
      backdrop-filter: blur(18px);
    }

    .panel + .panel,
    .two {
      margin-top: 1rem;
    }

    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.8rem;
    }

    .stack {
      display: grid;
      gap: 0.8rem;
    }

    .table-wrap {
      overflow-x: auto;
    }

    .two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 1rem;
    }

    @media (max-width: 820px) {
      .hero {
        display: block;
      }

      .metrics,
      .two {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
${input.body}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}
