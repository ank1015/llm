import { describe, expect, it } from 'vitest';

import { InMemoryKeysAdapter } from '../../src/memory-keys.js';

describe('InMemoryKeysAdapter', () => {
  it('should store and retrieve legacy api keys', async () => {
    const adapter = new InMemoryKeysAdapter();
    await adapter.set('anthropic', 'sk-ant-test');

    expect(await adapter.get('anthropic')).toBe('sk-ant-test');
    expect(await adapter.list()).toContain('anthropic');
  });

  it('should store and retrieve multi-field credentials', async () => {
    const adapter = new InMemoryKeysAdapter();
    await adapter.setCredentials?.('claude-code', {
      oauthToken: 'oauth-token',
      betaFlag: 'flag-a,flag-b',
      billingHeader: 'x-anthropic-billing-header: cc_version=test;',
    });

    const credentials = await adapter.getCredentials?.('claude-code');
    expect(credentials).toEqual({
      oauthToken: 'oauth-token',
      betaFlag: 'flag-a,flag-b',
      billingHeader: 'x-anthropic-billing-header: cc_version=test;',
    });
    expect(await adapter.get('claude-code')).toBeUndefined();
    expect(await adapter.list()).toContain('claude-code');
  });

  it('should keep apiKey in sync with credentials bundle', async () => {
    const adapter = new InMemoryKeysAdapter();
    await adapter.setCredentials?.('anthropic', { apiKey: 'bundle-key' });
    expect(await adapter.get('anthropic')).toBe('bundle-key');

    await adapter.set('anthropic', 'legacy-overwrite');
    expect((await adapter.getCredentials?.('anthropic'))?.apiKey).toBe('legacy-overwrite');
  });

  it('should normalize codex account aliases in credentials', async () => {
    const adapter = new InMemoryKeysAdapter();
    await adapter.setCredentials?.('codex', {
      apiKey: 'access-token',
      account_id: 'acc-123',
    });

    expect(await adapter.get('codex')).toBe('access-token');
    expect(await adapter.getCredentials?.('codex')).toEqual({
      apiKey: 'access-token',
      'chatgpt-account-id': 'acc-123',
    });
  });

  it('should preserve codex chatgpt-account-id when apiKey is updated via set()', async () => {
    const adapter = new InMemoryKeysAdapter();
    await adapter.setCredentials?.('codex', {
      apiKey: 'old-token',
      'chatgpt-account-id': 'acc-123',
    });

    await adapter.set('codex', 'new-token');

    expect(await adapter.get('codex')).toBe('new-token');
    expect(await adapter.getCredentials?.('codex')).toEqual({
      apiKey: 'new-token',
      'chatgpt-account-id': 'acc-123',
    });
  });

  it('should delete provider credentials', async () => {
    const adapter = new InMemoryKeysAdapter();
    await adapter.setCredentials?.('claude-code', {
      oauthToken: 'oauth-token',
      betaFlag: 'flag-a,flag-b',
      billingHeader: 'x-anthropic-billing-header: cc_version=test;',
    });

    expect(await adapter.delete('claude-code')).toBe(true);
    expect(await adapter.getCredentials?.('claude-code')).toBeUndefined();
    expect(await adapter.list()).not.toContain('claude-code');
  });
});
