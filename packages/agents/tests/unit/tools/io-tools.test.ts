import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createEditTool } from '../../../src/tools/edit.js';
import { createReadTool } from '../../../src/tools/read.js';
import { createWriteTool } from '../../../src/tools/write.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'llm-agents-tools-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('write tool', () => {
  it('creates parent directories and writes content', async () => {
    const cwd = await createTempDir();
    const tool = createWriteTool(cwd);

    const result = await tool.execute({
      toolCallId: 'write-1',
      params: { path: 'nested/notes.txt', content: 'hello' },
      context: { messages: [] },
    });

    expect(await readFile(join(cwd, 'nested/notes.txt'), 'utf8')).toBe('hello');
    expect(result.content).toEqual([
      { type: 'text', content: 'Successfully wrote 5 bytes to nested/notes.txt' },
    ]);
  });
});

describe('read tool', () => {
  it('reads text with offset and limit guidance', async () => {
    const tool = createReadTool('/workspace', {
      operations: {
        access: async () => {},
        readFile: async () => Buffer.from('alpha\nbeta\ngamma\ndelta', 'utf8'),
        detectImageMimeType: async () => null,
      },
    });

    const result = await tool.execute({
      toolCallId: 'read-1',
      params: { path: 'notes.txt', offset: 2, limit: 2 },
      context: { messages: [] },
    });

    expect(result.content).toEqual([
      {
        type: 'text',
        content: 'beta\ngamma\n\n[1 more lines in file. Use offset=4 to continue.]',
      },
    ]);
  });

  it('fails when offset is beyond the end of the file', async () => {
    const tool = createReadTool('/workspace', {
      operations: {
        access: async () => {},
        readFile: async () => Buffer.from('alpha\nbeta', 'utf8'),
        detectImageMimeType: async () => null,
      },
    });

    await expect(
      tool.execute({
        toolCallId: 'read-2',
        params: { path: 'notes.txt', offset: 99 },
        context: { messages: [] },
      })
    ).rejects.toThrow('Offset 99 is beyond end of file (2 lines total)');
  });
});

describe('edit tool', () => {
  it('replaces unique text and returns diff details', async () => {
    const cwd = await createTempDir();
    const filePath = join(cwd, 'notes.txt');
    await writeFile(filePath, 'hello\nworld\n', 'utf8');

    const tool = createEditTool(cwd);
    const result = await tool.execute({
      toolCallId: 'edit-1',
      params: { path: 'notes.txt', oldText: 'world', newText: 'team' },
      context: { messages: [] },
    });

    expect(await readFile(filePath, 'utf8')).toBe('hello\nteam\n');
    expect(result.content).toEqual([
      { type: 'text', content: 'Successfully replaced text in notes.txt.' },
    ]);
    expect(result.details?.diff).toContain('world');
    expect(result.details?.diff).toContain('team');
  });

  it('fails when the target text is not unique', async () => {
    const cwd = await createTempDir();
    const filePath = join(cwd, 'notes.txt');
    await writeFile(filePath, 'repeat\nvalue\nrepeat\n', 'utf8');

    const tool = createEditTool(cwd);

    await expect(
      tool.execute({
        toolCallId: 'edit-2',
        params: { path: 'notes.txt', oldText: 'repeat', newText: 'done' },
        context: { messages: [] },
      })
    ).rejects.toThrow('Found 2 occurrences of the text in notes.txt.');
  });
});
