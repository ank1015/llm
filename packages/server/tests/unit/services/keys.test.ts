/**
 * KeyService unit tests
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the home directory to use a temp directory for tests
const TEST_HOME = join(tmpdir(), `llm-test-keys-${Date.now()}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => TEST_HOME,
  };
});

// Import after mocking
const { KeyService } = await import('../../../src/services/keys.js');

describe('KeyService', () => {
  beforeAll(() => {
    // Create test home directory
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up keys directory after each test
    const keysDir = KeyService.getKeysDir();
    if (existsSync(keysDir)) {
      rmSync(keysDir, { recursive: true, force: true });
    }
  });

  describe('setKey and getKey', () => {
    it('should store and retrieve an API key', () => {
      const apiKey = 'sk-test-key-12345';
      KeyService.setKey('anthropic', apiKey);

      const retrieved = KeyService.getKey('anthropic');
      expect(retrieved).toBe(apiKey);
    });

    it('should store keys for different providers independently', () => {
      KeyService.setKey('anthropic', 'anthropic-key');
      KeyService.setKey('openai', 'openai-key');
      KeyService.setKey('google', 'google-key');

      expect(KeyService.getKey('anthropic')).toBe('anthropic-key');
      expect(KeyService.getKey('openai')).toBe('openai-key');
      expect(KeyService.getKey('google')).toBe('google-key');
    });

    it('should update an existing key', () => {
      KeyService.setKey('anthropic', 'old-key');
      KeyService.setKey('anthropic', 'new-key');

      expect(KeyService.getKey('anthropic')).toBe('new-key');
    });

    it('should return undefined for non-existent key', () => {
      expect(KeyService.getKey('anthropic')).toBeUndefined();
    });

    it('should handle special characters in API keys', () => {
      const specialKey = 'sk-ant-api03-test+key/with=special&chars!@#$%';
      KeyService.setKey('anthropic', specialKey);

      expect(KeyService.getKey('anthropic')).toBe(specialKey);
    });

    it('should handle very long API keys', () => {
      const longKey = 'sk-' + 'a'.repeat(1000);
      KeyService.setKey('anthropic', longKey);

      expect(KeyService.getKey('anthropic')).toBe(longKey);
    });

    it('should handle empty string key', () => {
      KeyService.setKey('anthropic', '');
      expect(KeyService.getKey('anthropic')).toBe('');
    });

    it('should handle unicode characters in API keys', () => {
      const unicodeKey = 'sk-测试密钥-🔑';
      KeyService.setKey('anthropic', unicodeKey);

      expect(KeyService.getKey('anthropic')).toBe(unicodeKey);
    });
  });

  describe('removeKey', () => {
    it('should remove an existing key', () => {
      KeyService.setKey('anthropic', 'test-key');
      expect(KeyService.hasKey('anthropic')).toBe(true);

      const removed = KeyService.removeKey('anthropic');
      expect(removed).toBe(true);
      expect(KeyService.hasKey('anthropic')).toBe(false);
      expect(KeyService.getKey('anthropic')).toBeUndefined();
    });

    it('should return false when removing non-existent key', () => {
      const removed = KeyService.removeKey('anthropic');
      expect(removed).toBe(false);
    });
  });

  describe('hasKey', () => {
    it('should return true for existing key', () => {
      KeyService.setKey('anthropic', 'test-key');
      expect(KeyService.hasKey('anthropic')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(KeyService.hasKey('anthropic')).toBe(false);
    });
  });

  describe('listProviders', () => {
    it('should return empty array when no keys stored', () => {
      const providers = KeyService.listProviders();
      expect(providers).toEqual([]);
    });

    it('should return list of providers with stored keys', () => {
      KeyService.setKey('anthropic', 'key1');
      KeyService.setKey('openai', 'key2');
      KeyService.setKey('google', 'key3');

      const providers = KeyService.listProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('google');
      expect(providers).toHaveLength(3);
    });

    it('should not include removed providers', () => {
      KeyService.setKey('anthropic', 'key1');
      KeyService.setKey('openai', 'key2');
      KeyService.removeKey('anthropic');

      const providers = KeyService.listProviders();
      expect(providers).not.toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toHaveLength(1);
    });
  });

  describe('encryption', () => {
    it('should store keys in encrypted format', () => {
      const apiKey = 'sk-plaintext-key';
      KeyService.setKey('anthropic', apiKey);

      // Read the raw file content
      const keysDir = KeyService.getKeysDir();
      const keyPath = join(keysDir, 'anthropic.key');
      const rawContent = readFileSync(keyPath, 'utf8');

      // Content should not contain the plaintext key
      expect(rawContent).not.toContain(apiKey);
      // Should be in encrypted format (iv:authTag:encrypted)
      expect(rawContent.split(':')).toHaveLength(3);
    });

    it('should return undefined for corrupted key file', () => {
      // Create keys directory and write invalid data
      const keysDir = KeyService.getKeysDir();
      mkdirSync(keysDir, { recursive: true });
      writeFileSync(join(keysDir, 'anthropic.key'), 'invalid-encrypted-data', 'utf8');

      expect(KeyService.getKey('anthropic')).toBeUndefined();
    });
  });

  describe('getKeysDir', () => {
    it('should return the keys directory path', () => {
      const keysDir = KeyService.getKeysDir();
      expect(keysDir).toContain('.llm');
      expect(keysDir).toContain('keys');
    });
  });
});
