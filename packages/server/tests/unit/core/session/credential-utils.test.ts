import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  extractClaudeCodeCredentials,
  loadCodexCredentials,
  reloadCredentials,
} from '../../../../src/core/session/credential-utils.js';

async function* emptyQueryRunner(): AsyncIterable<unknown> {
  // Intentionally empty to exercise timeout behavior.
}

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('credential-utils', () => {
  describe('loadCodexCredentials', () => {
    it('loads codex credentials from auth.json', async () => {
      const homeDir = await mkdtemp(join(tmpdir(), 'codex-home-'));
      temporaryPaths.push(homeDir);

      const codexDir = join(homeDir, '.codex');
      await mkdir(codexDir, { recursive: true });
      await writeFile(
        join(codexDir, 'auth.json'),
        JSON.stringify({
          tokens: {
            access_token: 'access-token',
            account_id: 'account-123',
          },
        })
      );

      expect(loadCodexCredentials({ homeDir })).toEqual({
        apiKey: 'access-token',
        'chatgpt-account-id': 'account-123',
      });
    });

    it('throws when the codex auth file is missing', () => {
      expect(() => loadCodexCredentials({ homeDir: '/tmp/does-not-exist' })).toThrow(
        'Codex auth file not found'
      );
    });

    it('reloadCredentials delegates codex loading', async () => {
      const homeDir = await mkdtemp(join(tmpdir(), 'codex-reload-'));
      temporaryPaths.push(homeDir);

      const codexDir = join(homeDir, '.codex');
      await mkdir(codexDir, { recursive: true });
      await writeFile(
        join(codexDir, 'auth.json'),
        JSON.stringify({
          tokens: {
            access_token: 'reloaded-token',
          },
        })
      );

      await expect(reloadCredentials('codex', { codex: { homeDir } })).resolves.toEqual({
        apiKey: 'reloaded-token',
      });
    });
  });

  describe('extractClaudeCodeCredentials', () => {
    it('fails early when the claude executable cannot be found', async () => {
      await expect(
        extractClaudeCodeCredentials({
          findClaudeExecutable: () => {
            throw new Error('Claude CLI not found. Install it first.');
          },
        })
      ).rejects.toThrow('Claude CLI not found. Install it first.');
    });

    it('times out when the helper never captures credentials', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'claude-cred-timeout-'));
      temporaryPaths.push(tempDir);

      await expect(
        extractClaudeCodeCredentials({
          findClaudeExecutable: () => '/usr/bin/claude',
          queryRunner: emptyQueryRunner,
          tempDir,
          timeoutMs: 25,
        })
      ).rejects.toThrow('Timeout: no credentials captured in 25ms');
    });

    it('rejects unsupported providers in reloadCredentials', async () => {
      await expect(reloadCredentials('openai')).rejects.toThrow('Reload not supported for openai');
    });
  });
});
