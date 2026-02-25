/* global clearTimeout, fetch, process, setTimeout */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..', '..');

let serverProcess;
let tempRoot;
let port;
let baseUrl;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServerReady() {
  const timeoutAt = Date.now() + 90_000;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(500);
  }

  throw new Error('Timed out waiting for Next.js API server to boot.');
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not resolve a free TCP port.'));
        return;
      }

      const freePort = address.port;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(freePort);
      });
    });
  });
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      serverProcess.kill('SIGKILL');
    }, 5_000);

    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    serverProcess.kill('SIGTERM');
  });
}

async function apiRequest(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const rawBody = await response.text();

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = rawBody;
  }

  return { response, body };
}

before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'chat-app-integration-'));
  const requestedPort = Number.parseInt(process.env.CHAT_APP_TEST_PORT ?? '', 10);
  port =
    Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : await findAvailablePort();
  baseUrl = `http://localhost:${port}`;

  const sessionsDir = join(tempRoot, 'sessions');
  const keysDir = join(tempRoot, 'keys');

  await mkdir(sessionsDir, { recursive: true });
  await mkdir(keysDir, { recursive: true });

  serverProcess = spawn('pnpm', ['--filter', '@ank1015/llm-chat-app', 'dev', '-p', String(port)], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      LLM_SESSIONS_DIR: sessionsDir,
      LLM_KEYS_DIR: keysDir,
    },
    stdio: 'pipe',
  });

  await waitForServerReady();
});

after(async () => {
  await stopServer();

  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

describe('chat-app API integration', () => {
  it('stores and deletes API keys through the keys routes', async () => {
    const initialList = await apiRequest('/api/keys', { method: 'GET' });
    assert.equal(initialList.response.status, 200);
    assert.equal(initialList.body.ok, true);

    const initialProvider = initialList.body.providers.find(
      (provider) => provider.api === 'openai'
    );
    assert.ok(initialProvider);
    assert.equal(initialProvider.hasKey, false);

    const putResult = await apiRequest('/api/keys/openai', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: 'sk-test-key' }),
    });

    assert.equal(putResult.response.status, 200);
    assert.equal(putResult.body.ok, true);
    assert.equal(putResult.body.provider, 'openai');

    const afterSetList = await apiRequest('/api/keys', { method: 'GET' });
    const afterSetProvider = afterSetList.body.providers.find(
      (provider) => provider.api === 'openai'
    );
    assert.ok(afterSetProvider);
    assert.equal(afterSetProvider.hasKey, true);

    const deleteResult = await apiRequest('/api/keys/openai', {
      method: 'DELETE',
    });

    assert.equal(deleteResult.response.status, 200);
    assert.equal(deleteResult.body.ok, true);
    assert.equal(deleteResult.body.provider, 'openai');

    const afterDeleteList = await apiRequest('/api/keys', { method: 'GET' });
    const afterDeleteProvider = afterDeleteList.body.providers.find(
      (provider) => provider.api === 'openai'
    );

    assert.ok(afterDeleteProvider);
    assert.equal(afterDeleteProvider.hasKey, false);
  });

  it('stores and deletes claude-code credential bundles through the keys routes', async () => {
    const initialList = await apiRequest('/api/keys', { method: 'GET' });
    assert.equal(initialList.response.status, 200);
    assert.equal(initialList.body.ok, true);

    const initialProvider = initialList.body.providers.find(
      (provider) => provider.api === 'claude-code'
    );
    assert.ok(initialProvider);
    assert.equal(initialProvider.hasKey, false);

    const putResult = await apiRequest('/api/keys/claude-code', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        oauthToken: 'sk-ant-oat01-test-token',
        betaFlag: 'claude-code-20250219,oauth-2025-04-20',
        billingHeader: 'x-anthropic-billing-header: cc_version=test; cc_entrypoint=sdk-ts;',
      }),
    });

    assert.equal(putResult.response.status, 200);
    assert.equal(putResult.body.ok, true);
    assert.equal(putResult.body.provider, 'claude-code');

    const afterSetList = await apiRequest('/api/keys', { method: 'GET' });
    const afterSetProvider = afterSetList.body.providers.find(
      (provider) => provider.api === 'claude-code'
    );
    assert.ok(afterSetProvider);
    assert.equal(afterSetProvider.hasKey, true);

    const deleteResult = await apiRequest('/api/keys/claude-code', {
      method: 'DELETE',
    });

    assert.equal(deleteResult.response.status, 200);
    assert.equal(deleteResult.body.ok, true);
    assert.equal(deleteResult.body.provider, 'claude-code');

    const afterDeleteList = await apiRequest('/api/keys', { method: 'GET' });
    const afterDeleteProvider = afterDeleteList.body.providers.find(
      (provider) => provider.api === 'claude-code'
    );

    assert.ok(afterDeleteProvider);
    assert.equal(afterDeleteProvider.hasKey, false);
  });

  it('stores and deletes codex credential bundles through the keys routes', async () => {
    const initialList = await apiRequest('/api/keys', { method: 'GET' });
    assert.equal(initialList.response.status, 200);
    assert.equal(initialList.body.ok, true);

    const initialProvider = initialList.body.providers.find((provider) => provider.api === 'codex');
    assert.ok(initialProvider);
    assert.equal(initialProvider.hasKey, false);

    const putResult = await apiRequest('/api/keys/codex', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: 'test-codex-access-token',
        'chatgpt-account-id': 'test-codex-account-id',
      }),
    });

    assert.equal(putResult.response.status, 200);
    assert.equal(putResult.body.ok, true);
    assert.equal(putResult.body.provider, 'codex');

    const afterSetList = await apiRequest('/api/keys', { method: 'GET' });
    const afterSetProvider = afterSetList.body.providers.find(
      (provider) => provider.api === 'codex'
    );
    assert.ok(afterSetProvider);
    assert.equal(afterSetProvider.hasKey, true);

    const deleteResult = await apiRequest('/api/keys/codex', {
      method: 'DELETE',
    });

    assert.equal(deleteResult.response.status, 200);
    assert.equal(deleteResult.body.ok, true);
    assert.equal(deleteResult.body.provider, 'codex');

    const afterDeleteList = await apiRequest('/api/keys', { method: 'GET' });
    const afterDeleteProvider = afterDeleteList.body.providers.find(
      (provider) => provider.api === 'codex'
    );

    assert.ok(afterDeleteProvider);
    assert.equal(afterDeleteProvider.hasKey, false);
  });

  it('creates a session and updates its name through the dedicated endpoint', async () => {
    const projectName = 'integration-tests';

    const createResult = await apiRequest('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectName,
        sessionName: 'New chat',
      }),
    });

    assert.equal(createResult.response.status, 201);
    assert.equal(createResult.body.ok, true);

    const sessionId = createResult.body.sessionId;
    assert.equal(typeof sessionId, 'string');
    assert.ok(sessionId.length > 0);

    const renameResult = await apiRequest(`/api/sessions/${sessionId}/name`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectName,
        sessionName: 'Renamed in integration test',
      }),
    });

    assert.equal(renameResult.response.status, 200);
    assert.equal(renameResult.body.ok, true);
    assert.equal(renameResult.body.header.sessionName, 'Renamed in integration test');

    const listResult = await apiRequest(`/api/sessions?projectName=${projectName}`, {
      method: 'GET',
    });

    assert.equal(listResult.response.status, 200);
    const listedSession = listResult.body.sessions.find(
      (session) => session.sessionId === sessionId
    );
    assert.ok(listedSession);
    assert.equal(listedSession.sessionName, 'Renamed in integration test');

    const deleteResult = await apiRequest(`/api/sessions/${sessionId}?projectName=${projectName}`, {
      method: 'DELETE',
    });

    assert.equal(deleteResult.response.status, 200);
    assert.equal(deleteResult.body.ok, true);
    assert.equal(deleteResult.body.deleted, true);
  });
});
