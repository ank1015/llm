import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { APPLY_PATCH_LARK_GRAMMAR, createApplyPatchTool } from '../../../src/tools/apply-patch.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'llm-agents-apply-patch-'));
  tempDirs.push(dir);
  return dir;
}

function wrapPatch(body: string): string {
  return `*** Begin Patch\n${body}\n*** End Patch`;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('apply_patch tool', () => {
  it('advertises the freeform grammar schema', async () => {
    const tool = createApplyPatchTool('/workspace');

    expect(tool.name).toBe('apply_patch');
    expect(tool.type).toBe('custom');
    expect(tool.format).toEqual({
      type: 'grammar',
      syntax: 'lark',
      definition: APPLY_PATCH_LARK_GRAMMAR,
    });
  });

  it('adds a file and creates parent directories', async () => {
    const cwd = await createTempDir();
    const tool = createApplyPatchTool(cwd);
    const result = await tool.execute({
      toolCallId: 'patch-1',
      params: { input: wrapPatch('*** Add File: nested/add.txt\n+ab\n+cd') },
      context: { messages: [] },
    });

    const path = join(cwd, 'nested/add.txt');
    expect(await readFile(path, 'utf8')).toBe('ab\ncd\n');
    expect(result.content).toEqual([
      { type: 'text', content: `Success. Updated the following files:\nA ${path}\n` },
    ]);
    expect(result.details?.added).toEqual([path]);
  });

  it('deletes a file', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'delete.txt');
    await writeFile(path, 'x', 'utf8');
    const tool = createApplyPatchTool(cwd);

    const result = await tool.execute({
      toolCallId: 'patch-2',
      params: { input: wrapPatch('*** Delete File: delete.txt') },
      context: { messages: [] },
    });

    await expect(readFile(path, 'utf8')).rejects.toThrow();
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.content).toBe(`Success. Updated the following files:\nD ${path}\n`);
  });

  it('updates a file', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'update.txt');
    await writeFile(path, 'foo\nbar\n', 'utf8');
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-3',
      params: { input: wrapPatch('*** Update File: update.txt\n@@\n foo\n-bar\n+baz') },
      context: { messages: [] },
    });

    expect(await readFile(path, 'utf8')).toBe('foo\nbaz\n');
  });

  it('moves an updated file', async () => {
    const cwd = await createTempDir();
    const source = join(cwd, 'source.txt');
    const dest = join(cwd, 'nested', 'dest.txt');
    await writeFile(source, 'line\n', 'utf8');
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-4',
      params: {
        input: wrapPatch(
          '*** Update File: source.txt\n*** Move to: nested/dest.txt\n@@\n-line\n+line2'
        ),
      },
      context: { messages: [] },
    });

    await expect(readFile(source, 'utf8')).rejects.toThrow();
    expect(await readFile(dest, 'utf8')).toBe('line2\n');
  });

  it('applies multiple chunks to a file', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'multi.txt');
    await writeFile(path, 'foo\nbar\nbaz\nqux\n', 'utf8');
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-5',
      params: {
        input: wrapPatch('*** Update File: multi.txt\n@@\n foo\n-bar\n+BAR\n@@\n baz\n-qux\n+QUX'),
      },
      context: { messages: [] },
    });

    expect(await readFile(path, 'utf8')).toBe('foo\nBAR\nbaz\nQUX\n');
  });

  it('inserts at EOF', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'eof.txt');
    await writeFile(path, 'foo\nbar\n', 'utf8');
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-6',
      params: { input: wrapPatch('*** Update File: eof.txt\n@@\n bar\n+baz\n*** End of File') },
      context: { messages: [] },
    });

    expect(await readFile(path, 'utf8')).toBe('foo\nbar\nbaz\n');
  });

  it('handles pure additions followed by removals', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'pure-add.txt');
    await writeFile(path, 'line1\nline2\nline3\n', 'utf8');
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-7',
      params: {
        input: wrapPatch(
          '*** Update File: pure-add.txt\n@@\n+after-context\n+second-line\n@@\n line1\n-line2\n-line3\n+line2-replacement'
        ),
      },
      context: { messages: [] },
    });

    expect(await readFile(path, 'utf8')).toBe(
      'line1\nline2-replacement\nafter-context\nsecond-line\n'
    );
  });

  it('matches unicode punctuation fuzzily', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'unicode.txt');
    await writeFile(
      path,
      'import asyncio  # local import \u2013 avoids top\u2011level dep\n',
      'utf8'
    );
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-8',
      params: {
        input: wrapPatch(
          '*** Update File: unicode.txt\n@@\n-import asyncio  # local import - avoids top-level dep\n+import asyncio  # HELLO'
        ),
      },
      context: { messages: [] },
    });

    expect(await readFile(path, 'utf8')).toBe('import asyncio  # HELLO\n');
  });

  it('accepts heredoc-wrapped input leniently', async () => {
    const cwd = await createTempDir();
    const path = join(cwd, 'heredoc.txt');
    const tool = createApplyPatchTool(cwd);

    await tool.execute({
      toolCallId: 'patch-9',
      params: { input: `<<'EOF'\n${wrapPatch('*** Add File: heredoc.txt\n+ok')}\nEOF\n` },
      context: { messages: [] },
    });

    expect(await readFile(path, 'utf8')).toBe('ok\n');
  });

  it('fails on invalid patch boundaries', async () => {
    const tool = createApplyPatchTool('/workspace');

    await expect(
      tool.execute({
        toolCallId: 'patch-10',
        params: { input: 'bad' },
        context: { messages: [] },
      })
    ).rejects.toThrow("invalid patch: The first line of the patch must be '*** Begin Patch'");
  });

  it('fails on empty update hunks', async () => {
    const tool = createApplyPatchTool('/workspace');

    await expect(
      tool.execute({
        toolCallId: 'patch-11',
        params: { input: wrapPatch('*** Update File: file.txt') },
        context: { messages: [] },
      })
    ).rejects.toThrow("invalid hunk at line 2, Update file hunk for path 'file.txt' is empty");
  });

  it('fails when an update target is missing', async () => {
    const cwd = await createTempDir();
    const tool = createApplyPatchTool(cwd);

    await expect(
      tool.execute({
        toolCallId: 'patch-12',
        params: { input: wrapPatch('*** Update File: missing.txt\n@@\n-old\n+new') },
        context: { messages: [] },
      })
    ).rejects.toThrow(`Failed to read file to update ${join(cwd, 'missing.txt')}`);
  });
});
