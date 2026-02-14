/**
 * Keys UI — A basic HTML interface for managing API keys.
 *
 * Starts a local HTTP server that serves a single-page UI and exposes
 * a small REST API backed by FileKeysAdapter.
 *
 * Usage:
 *   import { startKeysUI } from './keys-ui.js';
 *   startKeysUI({ port: 7700 });
 *
 * Or run directly:
 *   node dist/keys-ui.js
 */

import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { KnownApis, isValidApi } from '@ank1015/llm-types';

import { FileKeysAdapter } from './file-keys.js';

import type { Api } from '@ank1015/llm-types';

// ────────────────────────────────────────────────────────────────────
//  Credential reload logic per provider
// ────────────────────────────────────────────────────────────────────

/** Providers that support auto-reloading credentials from local config files. */
const RELOADABLE_APIS = new Set<Api>(['codex']);

/**
 * Read credentials from the provider's local config file.
 * Returns the credential map or throws with a user-friendly message.
 */
function reloadCredentials(api: Api): Record<string, string> {
  switch (api) {
    case 'codex': {
      const authPath = join(homedir(), '.codex', 'auth.json');
      if (!existsSync(authPath)) {
        throw new Error(`Codex auth file not found: ${authPath}`);
      }
      const auth = JSON.parse(readFileSync(authPath, 'utf8')) as {
        tokens?: { access_token?: string; account_id?: string };
      };
      const accessToken = auth.tokens?.access_token;
      const accountId = auth.tokens?.account_id;
      if (!accessToken) {
        throw new Error('No access_token found in codex auth.json');
      }
      const creds: Record<string, string> = { apiKey: accessToken };
      if (accountId) {
        creds['chatgpt-account-id'] = accountId;
      }
      return creds;
    }
    default:
      throw new Error(`Reload not supported for ${api}`);
  }
}

// ────────────────────────────────────────────────────────────────────
//  HTML template
// ────────────────────────────────────────────────────────────────────

function getHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LLM Keys Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f0f0f; color: #e0e0e0;
      max-width: 640px; margin: 0 auto; padding: 24px 16px;
    }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
    .provider {
      border: 1px solid #2a2a2a; border-radius: 8px;
      margin-bottom: 8px; overflow: hidden;
      transition: border-color 0.15s;
    }
    .provider:hover { border-color: #444; }
    .provider-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; cursor: pointer; user-select: none;
    }
    .provider-header:hover { background: #1a1a1a; }
    .provider-name { font-weight: 600; font-size: 0.95rem; }
    .badge {
      font-size: 0.7rem; padding: 2px 8px; border-radius: 9999px;
      font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em;
    }
    .badge-set { background: #064e3b; color: #6ee7b7; }
    .badge-missing { background: #3b1313; color: #fca5a5; }
    .provider-body {
      display: none; padding: 0 16px 16px;
      border-top: 1px solid #2a2a2a;
    }
    .provider-body.open { display: block; }
    .cred-row {
      display: flex; gap: 8px; margin-top: 10px; align-items: center;
    }
    .cred-row label {
      min-width: 80px; font-size: 0.8rem; color: #aaa;
    }
    .cred-row input {
      flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid #333;
      background: #1a1a1a; color: #e0e0e0; font-size: 0.85rem;
      font-family: "SF Mono", "Fira Code", monospace;
    }
    .cred-row input:focus { outline: none; border-color: #555; }
    .btn-eye {
      background: none; border: 1px solid #333; border-radius: 6px;
      color: #888; padding: 4px 7px; font-size: 0.85rem; cursor: pointer;
      line-height: 1; flex-shrink: 0;
    }
    .btn-eye:hover { color: #e0e0e0; border-color: #555; }
    .actions { display: flex; gap: 8px; margin-top: 14px; }
    button {
      padding: 6px 16px; border-radius: 6px; border: none;
      font-size: 0.8rem; font-weight: 500; cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .btn-save { background: #2563eb; color: #fff; }
    .btn-reload { background: #7c3aed; color: #e9d5ff; }
    .btn-delete { background: #7f1d1d; color: #fca5a5; }
    .toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      padding: 8px 20px; border-radius: 8px; font-size: 0.8rem;
      pointer-events: none; opacity: 0; transition: opacity 0.3s;
    }
    .toast.show { opacity: 1; }
    .toast-ok { background: #064e3b; color: #6ee7b7; }
    .toast-err { background: #7f1d1d; color: #fca5a5; }
  </style>
</head>
<body>
  <h1>LLM Keys Manager</h1>
  <p class="subtitle">Set and manage API keys for your providers</p>
  <div id="list"></div>
  <div id="toast" class="toast"></div>

  <script>
    const PROVIDERS = ${JSON.stringify(KnownApis)};
    const RELOADABLE = ${JSON.stringify([...RELOADABLE_APIS])};
    let keysStatus = {};

    function toast(msg, ok = true) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast show ' + (ok ? 'toast-ok' : 'toast-err');
      setTimeout(() => el.className = 'toast', 2000);
    }

    async function loadKeys() {
      const res = await fetch('/api/keys');
      const data = await res.json();
      keysStatus = {};
      for (const p of data.providers) {
        keysStatus[p.api] = p;
      }
      render();
    }

    function toggle(api) {
      const body = document.getElementById('body-' + api);
      body.classList.toggle('open');
    }

    function render() {
      const list = document.getElementById('list');
      list.innerHTML = PROVIDERS.map(api => {
        const info = keysStatus[api];
        const hasKey = info && info.hasKey;
        const creds = (info && info.credentials) || {};
        const credKeys = Object.keys(creds);
        // Always show at least an apiKey field
        const fields = credKeys.length > 0 ? credKeys : ['apiKey'];

        return '<div class="provider">'
          + '<div class="provider-header" onclick="toggle(\\'' + api + '\\')">'
          + '  <span class="provider-name">' + api + '</span>'
          + '  <span class="badge ' + (hasKey ? 'badge-set' : 'badge-missing') + '">'
          + (hasKey ? 'set' : 'missing') + '</span>'
          + '</div>'
          + '<div class="provider-body" id="body-' + api + '">'
          + fields.map(function(k) {
              const val = creds[k] || '';
              return '<div class="cred-row">'
                + '<label>' + k + '</label>'
                + '<input id="input-' + api + '-' + k + '" type="password"'
                + '  value="' + val.replace(/"/g, '&quot;') + '"'
                + '  placeholder="Enter ' + k + '" />'
                + (hasKey ? '<button class="btn-eye" title="Reveal" onclick="event.stopPropagation();toggleReveal(\\'' + api + '\\',\\'' + k + '\\',this)">\u{1F441}</button>' : '')
                + '</div>';
            }).join('')
          + '<div class="cred-row">'
          + '  <label style="color:#666">+ field</label>'
          + '  <input id="newfield-' + api + '" placeholder="field name" style="max-width:140px" />'
          + '  <button class="btn-save" onclick="addField(\\'' + api + '\\')" style="padding:4px 10px">Add</button>'
          + '</div>'
          + '<div class="actions">'
          + '  <button class="btn-save" onclick="save(\\'' + api + '\\')">Save</button>'
          + (RELOADABLE.includes(api) ? '  <button class="btn-reload" onclick="reload(\\'' + api + '\\')">Reload</button>' : '')
          + '  <button class="btn-delete" onclick="del(\\'' + api + '\\')">Delete</button>'
          + '</div>'
          + '</div>'
          + '</div>';
      }).join('');
    }

    function addField(api) {
      const input = document.getElementById('newfield-' + api);
      const name = input.value.trim();
      if (!name) return;
      // Add to keysStatus so it renders
      if (!keysStatus[api]) keysStatus[api] = { api: api, hasKey: false, credentials: {} };
      if (!keysStatus[api].credentials) keysStatus[api].credentials = {};
      keysStatus[api].credentials[name] = '';
      render();
      // Re-open the body
      document.getElementById('body-' + api).classList.add('open');
    }

    async function save(api) {
      const info = keysStatus[api];
      const creds = (info && info.credentials) || {};
      const fields = Object.keys(creds).length > 0 ? Object.keys(creds) : ['apiKey'];

      const credentials = {};
      for (const k of fields) {
        const el = document.getElementById('input-' + api + '-' + k);
        if (el && el.value.trim()) {
          credentials[k] = el.value.trim();
        }
      }

      if (Object.keys(credentials).length === 0) {
        toast('Enter at least one value', false);
        return;
      }

      const res = await fetch('/api/keys/' + api, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials }),
      });
      if (res.ok) {
        toast('Saved ' + api);
        await loadKeys();
        document.getElementById('body-' + api).classList.add('open');
      } else {
        toast('Failed to save', false);
      }
    }

    async function del(api) {
      if (!confirm('Delete all keys for ' + api + '?')) return;
      const res = await fetch('/api/keys/' + api, { method: 'DELETE' });
      if (res.ok) {
        toast('Deleted ' + api);
        await loadKeys();
      } else {
        toast('Failed to delete', false);
      }
    }

    async function reload(api) {
      const res = await fetch('/api/keys/' + api + '/reload', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast('Reloaded ' + api);
        await loadKeys();
        document.getElementById('body-' + api).classList.add('open');
      } else {
        toast(data.error || 'Reload failed', false);
      }
    }

    async function toggleReveal(api, field, btn) {
      const input = document.getElementById('input-' + api + '-' + field);
      if (!input) return;
      if (input.type === 'text') {
        // Hide — restore masked value
        input.type = 'password';
        const info = keysStatus[api];
        const masked = (info && info.credentials && info.credentials[field]) || '';
        input.value = masked;
        input.dataset.revealed = '';
        btn.style.color = '';
        return;
      }
      // Reveal — fetch real value from server
      try {
        const res = await fetch('/api/keys/' + api);
        if (!res.ok) { toast('Failed to fetch key', false); return; }
        const data = await res.json();
        const real = data.credentials && data.credentials[field];
        if (real) {
          input.type = 'text';
          input.value = real;
          input.dataset.revealed = '1';
          btn.style.color = '#6ee7b7';
        } else {
          toast('No value found', false);
        }
      } catch { toast('Failed to fetch key', false); }
    }

    loadKeys();
  </script>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────
//  HTTP helpers
// ────────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Mask a credential value for safe display (show first 4 and last 4 chars).
 */
function mask(value: string): string {
  if (value.length <= 10) return '••••••••';
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

// ────────────────────────────────────────────────────────────────────
//  Route handler
// ────────────────────────────────────────────────────────────────────

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  adapter: FileKeysAdapter
): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // Serve HTML page
  if (url === '/' && method === 'GET') {
    html(res, getHtml());
    return;
  }

  // GET /api/keys — list all providers with key status
  if (url === '/api/keys' && method === 'GET') {
    const storedApis = await adapter.list();
    const providers = await Promise.all(
      KnownApis.map(async (api) => {
        const hasKey = storedApis.includes(api);
        let credentials: Record<string, string> | undefined;
        if (hasKey) {
          const raw = await adapter.getCredentials(api);
          if (raw) {
            credentials = {};
            for (const [k, v] of Object.entries(raw)) {
              credentials[k] = mask(v);
            }
          }
        }
        return { api, hasKey, credentials };
      })
    );
    json(res, { ok: true, providers });
    return;
  }

  // POST /api/keys/:api/reload — auto-fetch credentials from local config
  const reloadMatch = url.match(/^\/api\/keys\/([a-z0-9-]+)\/reload$/);
  if (reloadMatch && method === 'POST') {
    const api = reloadMatch[1] as string;
    if (!isValidApi(api)) {
      json(res, { ok: false, error: `Unknown provider: ${api}` }, 400);
      return;
    }
    if (!RELOADABLE_APIS.has(api as Api)) {
      json(res, { ok: false, error: `Reload not supported for ${api}` }, 400);
      return;
    }
    const credentials = reloadCredentials(api as Api);
    await adapter.setCredentials(api as Api, credentials);
    json(res, { ok: true });
    return;
  }

  // Routes with :api param
  const apiMatch = url.match(/^\/api\/keys\/([a-z0-9-]+)$/);
  if (apiMatch) {
    const api = apiMatch[1] as string;
    if (!isValidApi(api)) {
      json(res, { ok: false, error: `Unknown provider: ${api}` }, 400);
      return;
    }

    // GET /api/keys/:api — get unmasked credentials
    if (method === 'GET') {
      const credentials = await adapter.getCredentials(api as Api);
      json(res, { ok: true, credentials: credentials ?? {} });
      return;
    }

    // PUT /api/keys/:api — set key or credentials
    if (method === 'PUT') {
      const body = JSON.parse(await readBody(req)) as {
        key?: string;
        credentials?: Record<string, string>;
      };

      if (body.credentials && typeof body.credentials === 'object') {
        await adapter.setCredentials(api as Api, body.credentials);
      } else if (typeof body.key === 'string') {
        await adapter.set(api as Api, body.key);
      } else {
        json(res, { ok: false, error: 'Provide "key" or "credentials"' }, 400);
        return;
      }

      json(res, { ok: true });
      return;
    }

    // DELETE /api/keys/:api
    if (method === 'DELETE') {
      const deleted = await adapter.delete(api as Api);
      json(res, { ok: true, deleted });
      return;
    }
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
}

// ────────────────────────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────────────────────────

export interface KeysUIOptions {
  /** Port to listen on (default: 7700) */
  port?: number | undefined;
  /** Custom keys directory (default: ~/.llm/global/keys/) */
  keysDir?: string | undefined;
}

/**
 * Start the Keys UI server.
 *
 * @returns A handle with the HTTP server and URL.
 */
export function startKeysUI(options: KeysUIOptions = {}): {
  server: ReturnType<typeof createServer>;
  url: string;
} {
  const port = options.port ?? 7700;
  const adapter = new FileKeysAdapter(options.keysDir);

  const server = createServer((req, res) => {
    handleRequest(req, res, adapter).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal server error';
      json(res, { ok: false, error: message }, 500);
    });
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Keys UI running at ${url}`);
  });

  return { server, url: `http://localhost:${port}` };
}

// ────────────────────────────────────────────────────────────────────
//  CLI entry point — run directly with: node dist/keys-ui.js
// ────────────────────────────────────────────────────────────────────

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('keys-ui.js') || process.argv[1].endsWith('keys-ui.ts'));

if (isDirectRun) {
  const port = parseInt(process.env.PORT ?? '7700', 10);
  const keysDir = process.env.LLM_KEYS_DIR;
  startKeysUI({ port, keysDir });
}
