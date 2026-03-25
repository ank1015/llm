import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DeleteKeyResponseSchema,
  KeyProviderDetailsResponseSchema,
  KeysListResponseSchema,
  ReloadKeyResponseSchema,
  SetKeyResponseSchema,
} from '@ank1015/llm-app-contracts';
import { FileKeysAdapter } from '@ank1015/llm-sdk-adapters';
import { Value } from '@sinclair/typebox/value';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createKeyRoutes } from '../../../src/routes/keys.js';

import type { Api } from '@ank1015/llm-sdk';

let keysDir: string;
let adapter: FileKeysAdapter;

beforeEach(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'test-keys-'));
  await mkdir(keysDir, { recursive: true });
  adapter = new FileKeysAdapter(keysDir);
});

afterEach(async () => {
  await rm(keysDir, { recursive: true, force: true });
});

function createTestApp(
  options: {
    reloadCredentials?: (api: Api) => Promise<Record<string, string>>;
  } = {}
) {
  return new Hono().route(
    '/api',
    createKeyRoutes({
      keysAdapter: adapter,
      reloadCredentials: options.reloadCredentials,
    })
  );
}

function maskCredentialValue(value: string): string {
  if (value.length <= 10) {
    return '********';
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

describe('Key Routes', () => {
  it('lists providers with masked credentials', async () => {
    await adapter.set('openai', 'sk-openai-1234567890');
    const app = createTestApp();

    const res = await app.request('/api/keys');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Value.Check(KeysListResponseSchema, body)).toBe(true);
    expect(body.providers).toHaveLength(11);
    expect(body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          api: 'openai',
          hasKey: true,
          credentials: {
            apiKey: maskCredentialValue('sk-openai-1234567890'),
          },
        }),
        expect.objectContaining({
          api: 'codex',
          hasKey: false,
        }),
      ])
    );
  });

  it('returns unmasked credential bundles for a provider', async () => {
    await adapter.setCredentials?.('codex', {
      apiKey: 'access-token',
      'chatgpt-account-id': 'acc-123',
    });
    const app = createTestApp();

    const res = await app.request('/api/keys/codex');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Value.Check(KeyProviderDetailsResponseSchema, body)).toBe(true);
    expect(body.credentials).toEqual({
      apiKey: 'access-token',
      'chatgpt-account-id': 'acc-123',
    });
  });

  it('stores a standard provider key with PUT', async () => {
    const app = createTestApp();

    const res = await app.request('/api/keys/google', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'google-key-123' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Value.Check(SetKeyResponseSchema, body)).toBe(true);
    expect(await adapter.get('google')).toBe('google-key-123');
  });

  it('deletes stored keys and credential bundles', async () => {
    await adapter.set('anthropic', 'anthropic-key-123');
    const app = createTestApp();

    const res = await app.request('/api/keys/anthropic', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Value.Check(DeleteKeyResponseSchema, body)).toBe(true);
    expect(body.deleted).toBe(true);
    expect(await adapter.get('anthropic')).toBeUndefined();
  });

  it('reloads supported providers and persists the returned credentials', async () => {
    const reloadCredentialsMock = vi.fn(async () => ({
      apiKey: 'reloaded-token',
      'chatgpt-account-id': 'acc-999',
    }));
    const app = createTestApp({
      reloadCredentials: reloadCredentialsMock,
    });

    const res = await app.request('/api/keys/codex/reload', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Value.Check(ReloadKeyResponseSchema, body)).toBe(true);
    expect(reloadCredentialsMock).toHaveBeenCalledWith('codex');
    expect(await adapter.getCredentials?.('codex')).toEqual({
      apiKey: 'reloaded-token',
      'chatgpt-account-id': 'acc-999',
    });
  });

  it('rejects reload for unsupported providers', async () => {
    const app = createTestApp();

    const res = await app.request('/api/keys/openai/reload', {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Reload not supported for openai');
  });
});
