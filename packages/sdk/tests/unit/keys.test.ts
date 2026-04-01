import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  getProviderCredentialSpec,
  parseKeysFile,
  readKeysFile,
  resolveProviderCredentials,
  resolveProviderCredentialsFromValues,
  setProviderCredentials,
  stringifyKeysFile,
  upsertKeysFileValues,
} from '../../src/keys.js';

const tempDirectories: string[] = [];

async function createTempFile(fileName = 'keys.env'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-keys-'));
  tempDirectories.push(directory);
  return join(directory, fileName);
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('keys', () => {
  describe('parseKeysFile', () => {
    it('parses dotenv-style key files', () => {
      const values = parseKeysFile(`
# comment
OPENAI_API_KEY=sk-openai
export GOOGLE_API_KEY="google key"
CLAUDE_CODE_BILLING_HEADER='x-billing-account: acc-123'
CODEX_CHATGPT_ACCOUNT_ID=acc=123
`);

      expect(values).toEqual({
        OPENAI_API_KEY: 'sk-openai',
        GOOGLE_API_KEY: 'google key',
        CLAUDE_CODE_BILLING_HEADER: 'x-billing-account: acc-123',
        CODEX_CHATGPT_ACCOUNT_ID: 'acc=123',
      });
    });
  });

  describe('stringifyKeysFile', () => {
    it('quotes values when needed', () => {
      const content = stringifyKeysFile({
        OPENAI_API_KEY: 'sk-openai',
        CLAUDE_CODE_BILLING_HEADER: 'x-billing-account: acc 123',
      });

      expect(content).toBe(
        'OPENAI_API_KEY=sk-openai\nCLAUDE_CODE_BILLING_HEADER="x-billing-account: acc 123"\n'
      );
    });
  });

  describe('getProviderCredentialSpec', () => {
    it('returns provider field mappings', () => {
      expect(getProviderCredentialSpec('codex')).toEqual({
        provider: 'codex',
        fields: [
          { option: 'apiKey', env: 'CODEX_API_KEY', aliases: [] },
          {
            option: 'chatgpt-account-id',
            env: 'CODEX_CHATGPT_ACCOUNT_ID',
            aliases: ['CHATGPT_ACCOUNT_ID'],
          },
        ],
      });
    });
  });

  describe('resolveProviderCredentialsFromValues', () => {
    it('supports aliases for provider keys', () => {
      const result = resolveProviderCredentialsFromValues('anthropic', {
        ANTHROPIC_API_KEYS: 'sk-ant-test',
      });

      expect(result).toEqual({
        ok: true,
        provider: 'anthropic',
        credentials: {
          apiKey: 'sk-ant-test',
        },
      });
    });

    it('returns a typed missing-credentials error', () => {
      const result = resolveProviderCredentialsFromValues('codex', {
        CODEX_API_KEY: 'codex-key',
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error('Expected missing credentials error.');
      }

      expect(result.error.code).toBe('missing_provider_credentials');
      expect(result.error.message).toContain('chatgpt-account-id');
      expect(result.error.missing).toEqual([
        {
          option: 'chatgpt-account-id',
          env: 'CODEX_CHATGPT_ACCOUNT_ID',
          aliases: ['CHATGPT_ACCOUNT_ID'],
        },
      ]);
    });
  });

  describe('resolveProviderCredentials', () => {
    it('returns a file-not-found error when the keys file does not exist', async () => {
      const filePath = join(tmpdir(), 'llm-sdk-does-not-exist.env');
      const result = await resolveProviderCredentials(filePath, 'openai');

      expect(result).toEqual({
        ok: false,
        provider: 'openai',
        error: {
          code: 'keys_file_not_found',
          message: `Keys file not found at ${filePath}`,
          provider: 'openai',
          path: filePath,
        },
      });
    });
  });

  describe('setProviderCredentials', () => {
    it('writes provider values and round-trips them through the file', async () => {
      const filePath = await createTempFile();

      await setProviderCredentials(filePath, 'claude-code', {
        oauthToken: 'oauth-token',
        betaFlag: 'oauth-2025-04-20',
        billingHeader: 'x-billing-account: acc 123',
      });

      const content = await readFile(filePath, 'utf8');
      expect(content).toBe(
        'CLAUDE_CODE_OAUTH_TOKEN=oauth-token\n' +
          'CLAUDE_CODE_BETA_FLAG=oauth-2025-04-20\n' +
          'CLAUDE_CODE_BILLING_HEADER="x-billing-account: acc 123"\n'
      );

      const result = await resolveProviderCredentials(filePath, 'claude-code');
      expect(result).toEqual({
        ok: true,
        provider: 'claude-code',
        credentials: {
          oauthToken: 'oauth-token',
          betaFlag: 'oauth-2025-04-20',
          billingHeader: 'x-billing-account: acc 123',
        },
      });
    });

    it('merges provider values into existing files', async () => {
      const filePath = await createTempFile();
      await writeFile(filePath, 'OPENAI_API_KEY=sk-openai\n', 'utf8');

      await setProviderCredentials(filePath, 'google', {
        apiKey: 'google-key',
      });

      expect(await readKeysFile(filePath)).toEqual({
        OPENAI_API_KEY: 'sk-openai',
        GOOGLE_API_KEY: 'google-key',
      });
    });
  });

  describe('upsertKeysFileValues', () => {
    it('updates existing keys and appends new ones', async () => {
      const filePath = await createTempFile();
      await writeFile(filePath, 'OPENAI_API_KEY=old\nGOOGLE_API_KEY=google\n', 'utf8');

      await upsertKeysFileValues(filePath, {
        OPENAI_API_KEY: 'new',
        ANTHROPIC_API_KEY: 'anthropic',
      });

      expect(await readKeysFile(filePath)).toEqual({
        OPENAI_API_KEY: 'new',
        GOOGLE_API_KEY: 'google',
        ANTHROPIC_API_KEY: 'anthropic',
      });
    });
  });
});
