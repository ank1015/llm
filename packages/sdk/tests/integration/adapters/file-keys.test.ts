/**
 * Integration tests for FileKeysAdapter
 *
 * These tests use a temporary directory for file operations.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createFileKeysAdapter, FileKeysAdapter } from '@ank1015/llm-sdk-adapters';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('FileKeysAdapter Integration', () => {
  let adapter: FileKeysAdapter;
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `llm-keys-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    adapter = createFileKeysAdapter(testDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('set and get', () => {
    it('should store and retrieve an API key', async () => {
      await adapter.set('anthropic', 'sk-ant-test-key-123');

      const key = await adapter.get('anthropic');
      expect(key).toBe('sk-ant-test-key-123');
    });

    it('should handle multiple providers', async () => {
      await adapter.set('anthropic', 'sk-ant-key');
      await adapter.set('openai', 'sk-openai-key');
      await adapter.set('google', 'google-key');

      expect(await adapter.get('anthropic')).toBe('sk-ant-key');
      expect(await adapter.get('openai')).toBe('sk-openai-key');
      expect(await adapter.get('google')).toBe('google-key');
    });

    it('should overwrite existing key', async () => {
      await adapter.set('anthropic', 'old-key');
      await adapter.set('anthropic', 'new-key');

      const key = await adapter.get('anthropic');
      expect(key).toBe('new-key');
    });

    it('should return undefined for non-existent key', async () => {
      const key = await adapter.get('anthropic');
      expect(key).toBeUndefined();
    });

    it('should handle special characters in key', async () => {
      const specialKey = 'sk-ant-api_key/with+special=chars!@#$%^&*()';
      await adapter.set('anthropic', specialKey);

      const key = await adapter.get('anthropic');
      expect(key).toBe(specialKey);
    });

    it('should handle long keys', async () => {
      const longKey = 'x'.repeat(10000);
      await adapter.set('anthropic', longKey);

      const key = await adapter.get('anthropic');
      expect(key).toBe(longKey);
    });
  });

  describe('credential bundles', () => {
    it('should store and retrieve claude-code credentials', async () => {
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
    });
  });

  describe('delete', () => {
    it('should delete an existing key', async () => {
      await adapter.set('anthropic', 'test-key');

      const deleted = await adapter.delete('anthropic');
      expect(deleted).toBe(true);

      const key = await adapter.get('anthropic');
      expect(key).toBeUndefined();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await adapter.delete('anthropic');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no keys stored', async () => {
      const providers = await adapter.list();
      expect(providers).toEqual([]);
    });

    it('should list all providers with stored keys', async () => {
      await adapter.set('anthropic', 'key1');
      await adapter.set('openai', 'key2');
      await adapter.set('google', 'key3');

      const providers = await adapter.list();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
      expect(providers.length).toBe(3);
    });

    it('should not list deleted keys', async () => {
      await adapter.set('anthropic', 'key1');
      await adapter.set('openai', 'key2');
      await adapter.delete('anthropic');

      const providers = await adapter.list();
      expect(providers).not.toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('should list provider when only credential bundle exists', async () => {
      await adapter.setCredentials?.('claude-code', {
        oauthToken: 'oauth-token',
        betaFlag: 'flag-a,flag-b',
        billingHeader: 'x-anthropic-billing-header: cc_version=test;',
      });

      const providers = await adapter.list();
      expect(providers).toContain('claude-code');
    });
  });

  describe('encryption', () => {
    it('should encrypt keys at rest', async () => {
      await adapter.set('anthropic', 'secret-key-12345');

      // Read the raw file content
      const keyPath = join(testDir, 'anthropic.key');
      expect(existsSync(keyPath)).toBe(true);

      const { readFileSync } = await import('node:fs');
      const rawContent = readFileSync(keyPath, 'utf8');

      // Raw content should NOT contain the plaintext key
      expect(rawContent).not.toContain('secret-key-12345');

      // But we can still retrieve the decrypted key
      const key = await adapter.get('anthropic');
      expect(key).toBe('secret-key-12345');
    });

    it('should use consistent encryption across instances', async () => {
      await adapter.set('anthropic', 'test-key');

      // Create a new adapter instance pointing to the same directory
      const adapter2 = createFileKeysAdapter(testDir);

      // Should be able to read the key from the new instance
      const key = await adapter2.get('anthropic');
      expect(key).toBe('test-key');
    });
  });

  describe('directory management', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = join(testDir, 'nested', 'keys', 'dir');
      const newAdapter = createFileKeysAdapter(newDir);

      await newAdapter.set('anthropic', 'test-key');

      expect(existsSync(newDir)).toBe(true);
      expect(await newAdapter.get('anthropic')).toBe('test-key');
    });

    it('should return correct keys directory path', () => {
      expect(adapter.getKeysDir()).toBe(testDir);
    });
  });
});
