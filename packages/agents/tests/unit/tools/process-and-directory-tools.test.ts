import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBashTool } from '../../../src/tools/bash.js';
import { createFindTool } from '../../../src/tools/find.js';
import { createLsTool } from '../../../src/tools/ls.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'llm-agents-dir-tools-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('bash tool', () => {
  it('applies command prefix and spawn hook before execution', async () => {
    let receivedCommand = '';
    let receivedCwd = '';
    let receivedFlag = '';
    const updates: string[] = [];

    const tool = createBashTool('/repo', {
      commandPrefix: 'set -e',
      spawnHook: (context) => ({
        ...context,
        cwd: '/repo/subdir',
        env: { ...context.env, TEST_FLAG: 'enabled' },
      }),
      operations: {
        exec: async (command, cwd, { env, onData }) => {
          receivedCommand = command;
          receivedCwd = cwd;
          receivedFlag = env?.TEST_FLAG ?? '';
          onData(Buffer.from('first line\n', 'utf8'));
          onData(Buffer.from('second line', 'utf8'));
          return { exitCode: 0 };
        },
      },
    });

    const result = await tool.execute({
      toolCallId: 'bash-1',
      params: { command: 'echo ok' },
      context: { messages: [] },
      onUpdate: (partial) => {
        const content = partial.content[0];
        if (content?.type === 'text') {
          updates.push(content.content);
        }
      },
    });

    expect(receivedCommand).toBe('set -e\necho ok');
    expect(receivedCwd).toBe('/repo/subdir');
    expect(receivedFlag).toBe('enabled');
    expect(result.content).toEqual([{ type: 'text', content: 'first line\nsecond line' }]);
    expect(updates).not.toHaveLength(0);
  });
});

describe('find tool', () => {
  it('formats results relative to the search directory', async () => {
    const tool = createFindTool('/repo', {
      operations: {
        exists: () => true,
        glob: () => ['/repo/src/a.ts', '/repo/src/nested/b.ts'],
      },
    });

    const result = await tool.execute({
      toolCallId: 'find-1',
      params: { path: 'src', pattern: '**/*.ts' },
      context: { messages: [] },
    });

    expect(result.content).toEqual([{ type: 'text', content: 'a.ts\nnested/b.ts' }]);
  });
});

describe('ls tool', () => {
  it('lists entries alphabetically and marks directories', async () => {
    const cwd = await createTempDir();
    await mkdir(join(cwd, 'b-dir'));
    await writeFile(join(cwd, 'a-file.txt'), 'hello', 'utf8');

    const tool = createLsTool(cwd);
    const result = await tool.execute({
      toolCallId: 'ls-1',
      params: {},
      context: { messages: [] },
    });

    expect(result.content).toEqual([{ type: 'text', content: 'a-file.txt\nb-dir/' }]);
  });
});
