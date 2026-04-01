import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  appendSessionCustom,
  appendSessionMessage,
  createSessionAppender,
  createSession,
  createSessionPath,
  getSessionHead,
  getSessionLineage,
  getSessionNode,
  InvalidSessionParentError,
  listSessionBranches,
  loadSessionMessages,
  readSession,
} from '../../src/session.js';
import { resetSdkConfig, setSdkConfig } from '../../src/config.js';

import type { Message, SessionNodeSaver } from '../../src/index.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  resetSdkConfig();
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-session-'));
  tempDirectories.push(directory);
  return directory;
}

function buildUserMessage(text: string): Message {
  return {
    role: 'user',
    id: `user-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    content: [{ type: 'text', content: text }],
  };
}

describe('session helpers', () => {
  it('creates a session file at an auto-generated path', async () => {
    const baseDir = await createTempDirectory();
    setSdkConfig({ sessionsBaseDir: baseDir });

    const path = createSessionPath();
    expect(path.startsWith(baseDir)).toBe(true);
    expect(path.endsWith('.jsonl')).toBe(true);

    const session = await createSession({
      title: 'Test Session',
      metadata: { project: 'sdk' },
    });

    expect(session.path.startsWith(baseDir)).toBe(true);
    expect(session.header.type).toBe('session');
    expect(session.header.title).toBe('Test Session');
    expect(session.header.metadata).toEqual({ project: 'sdk' });
    expect(session.nodes).toEqual([]);

    const content = await readFile(session.path, 'utf8');
    expect(content.trim().split('\n')).toHaveLength(1);
  });

  it('appends messages and loads main-branch history', async () => {
    const baseDir = await createTempDirectory();
    const first = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('hello'),
    });

    const second = await appendSessionMessage({
      path: first.path,
      message: buildUserMessage('world'),
    });

    expect(second.path).toBe(first.path);

    const session = await readSession(first.path);
    expect(session?.nodes).toHaveLength(2);

    const loaded = await loadSessionMessages({ path: first.path });
    expect(loaded?.messages).toEqual([
      buildUserMessage('hello'),
      buildUserMessage('world'),
    ]);

    const head = await getSessionHead(first.path);
    expect(head?.type).toBe('message');
    if (head?.type === 'message') {
      expect(head.message).toEqual(buildUserMessage('world'));
    }
  });

  it('reconstructs branch history through the parent chain instead of branch filtering', async () => {
    const baseDir = await createTempDirectory();
    const mainOne = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('main-1'),
    });
    const mainTwo = await appendSessionMessage({
      path: mainOne.path,
      message: buildUserMessage('main-2'),
    });

    const altOne = await appendSessionMessage({
      path: mainOne.path,
      branch: 'alt',
      parentId: mainTwo.node.id,
      message: buildUserMessage('alt-1'),
    });
    await appendSessionMessage({
      path: mainOne.path,
      branch: 'alt',
      message: buildUserMessage('alt-2'),
    });

    const loaded = await loadSessionMessages({
      path: mainOne.path,
      branch: 'alt',
    });

    expect(loaded?.messages).toEqual([
      buildUserMessage('main-1'),
      buildUserMessage('main-2'),
      buildUserMessage('alt-1'),
      buildUserMessage('alt-2'),
    ]);

    const lineage = await getSessionLineage(mainOne.path, { headId: altOne.node.id });
    expect(lineage?.nodes.map((node) => node.id)).toEqual([
      mainOne.node.id,
      mainTwo.node.id,
      altOne.node.id,
    ]);
  });

  it('appends custom nodes and exposes branch summaries and node lookups', async () => {
    const baseDir = await createTempDirectory();
    const first = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('main-1'),
    });
    await appendSessionCustom({
      path: first.path,
      branch: 'review',
      name: 'checkpoint',
      payload: { status: 'ready' },
    });

    const branches = await listSessionBranches(first.path);
    expect(branches).toEqual([
      {
        name: 'main',
        headId: first.node.id,
        branchPointId: null,
        nodeCount: 1,
      },
      {
        name: 'review',
        headId: expect.any(String),
        branchPointId: first.node.id,
        nodeCount: 1,
      },
    ]);

    const session = await readSession(first.path);
    const customNode = session?.nodes.find((node) => node.type === 'custom');
    expect(customNode).toBeDefined();

    const found = await getSessionNode(first.path, customNode!.id);
    expect(found).toEqual(customNode);
  });

  it('supports appending multiple nodes through a session appender without reloading the session each time', async () => {
    const baseDir = await createTempDirectory();
    const first = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('main-1'),
    });

    const appender = await createSessionAppender({
      path: first.path,
    });

    expect(appender.headId).toBe(first.node.id);
    expect(appender.branch).toBe('main');

    const second = await appender.appendMessage({
      message: buildUserMessage('main-2'),
    });
    expect(appender.headId).toBe(second.node.id);

    const custom = await appender.appendCustom({
      name: 'checkpoint',
      payload: { status: 'ready' },
    });
    expect(appender.headId).toBe(custom.node.id);

    const loaded = await loadSessionMessages({
      path: first.path,
      headId: custom.node.id,
    });

    expect(loaded?.messages).toEqual([
      buildUserMessage('main-1'),
      buildUserMessage('main-2'),
    ]);

    const node = await getSessionNode(first.path, custom.node.id);
    expect(node).toEqual(custom.node);
  });

  it('treats a missing branch as a new branch from the current main head', async () => {
    const baseDir = await createTempDirectory();
    const first = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('main-1'),
    });
    const second = await appendSessionMessage({
      path: first.path,
      message: buildUserMessage('main-2'),
    });

    const loaded = await loadSessionMessages({
      path: first.path,
      branch: 'feature',
    });

    expect(loaded?.branch).toBe('feature');
    expect(loaded?.head.id).toBe(second.node.id);
    expect(loaded?.messages).toEqual([
      buildUserMessage('main-1'),
      buildUserMessage('main-2'),
    ]);

    const featureNode = await appendSessionMessage({
      path: first.path,
      branch: 'feature',
      message: buildUserMessage('feature-1'),
    });

    expect(featureNode.node.parentId).toBe(second.node.id);

    const featureHistory = await loadSessionMessages({
      path: first.path,
      branch: 'feature',
    });

    expect(featureHistory?.messages).toEqual([
      buildUserMessage('main-1'),
      buildUserMessage('main-2'),
      buildUserMessage('feature-1'),
    ]);
  });

  it('supports custom message loaders and custom node savers', async () => {
    const baseDir = await createTempDirectory();
    const saveNode = vi.fn<SessionNodeSaver>(async ({ path, node }) => {
      const current = await readFile(path, 'utf8');
      await rm(path, { force: true });
      await readFile(path, 'utf8').catch(() => undefined);
      await writeCustomNode(path, `${current}${JSON.stringify(node)}\n`);
    });

    const appended = await appendSessionMessage({
      baseDir,
      message: buildUserMessage('saved-via-custom-saver'),
      saveNode,
    });

    expect(saveNode).toHaveBeenCalledOnce();

    const messagesLoader = vi.fn(async ({ lineage }) =>
      lineage.nodes
        .filter((node) => node.type === 'message')
        .map((node) => ({
          role: 'custom' as const,
          id: `shadow-${node.id}`,
          content: { originalRole: node.message.role },
        }))
    );

    const loaded = await loadSessionMessages({
      path: appended.path,
      messagesLoader,
    });

    expect(messagesLoader).toHaveBeenCalledOnce();
    expect(loaded?.messages).toEqual([
      {
        role: 'custom',
        id: expect.stringMatching(/^shadow-/u),
        content: { originalRole: 'user' },
      },
    ]);
  });

  it('throws when an explicit parent id does not exist', async () => {
    const baseDir = await createTempDirectory();
    const created = await createSession({ baseDir });

    await expect(
      appendSessionMessage({
        path: created.path,
        parentId: 'missing-parent',
        message: buildUserMessage('hello'),
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'InvalidSessionParentError',
        path: created.path,
        parentId: 'missing-parent',
      })
    );

    expect(await getSessionNode(created.path, created.header.id)).toEqual(created.header);
    expect(InvalidSessionParentError).toBeDefined();
  });
});

async function writeCustomNode(path: string, content: string): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}
