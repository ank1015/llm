import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTempServerConfig, jsonRequest } from '../../helpers/server-fixture.js';

import type { AgentInput, AgentRun } from '@ank1015/llm-sdk';

const {
  mockAgent,
  mockLlm,
  mockCreateAllTools,
  mockCreateCheckpointSummaryPrompt,
  mockCreateSystemPrompt,
} = vi.hoisted(() => ({
  mockAgent: vi.fn(),
  mockLlm: vi.fn(),
  mockCreateAllTools: vi.fn(),
  mockCreateCheckpointSummaryPrompt: vi.fn(),
  mockCreateSystemPrompt: vi.fn(),
}));

vi.mock('@ank1015/llm-agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-agents')>();
  return {
    ...actual,
    createAllTools: mockCreateAllTools,
    createCheckpointSummaryPrompt: mockCreateCheckpointSummaryPrompt,
    createSystemPrompt: mockCreateSystemPrompt,
  };
});

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();
  return {
    ...actual,
    agent: mockAgent,
    llm: mockLlm,
  };
});

const { createApp } = await import('../../../src/app.js');
const { ArtifactDir } = await import('../../../src/core/artifact-dir/artifact-dir.js');
const { artifactCheckpointService } = await import(
  '../../../src/core/artifact-checkpoint/service.js'
);
const { Project } = await import('../../../src/core/project/project.js');
const { resetSessionRunRegistry } = await import('../../../src/core/session/run-registry.js');

let cleanup: (() => Promise<void>) | null = null;
let app = createApp();

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-checkpoint-app');
  cleanup = fixture.cleanup;

  resetSessionRunRegistry();
  mockCreateAllTools.mockReset().mockReturnValue({});
  mockCreateCheckpointSummaryPrompt.mockReset().mockReturnValue('checkpoint summary prompt');
  mockCreateSystemPrompt.mockReset().mockResolvedValue('system prompt');
  mockLlm.mockReset();
  mockAgent.mockReset().mockImplementation((input: AgentInput) => {
    const sessionPath = (input.session as { path?: string } | undefined)?.path ?? '';
    const resultPromise = (async () => {
      if (sessionPath) {
        await mkdir(dirname(sessionPath), { recursive: true });
        await writeFile(sessionPath, 'checkpoint summary session', 'utf8');
      }

      return {
        ok: true,
        sessionPath,
        sessionId: 'summary-session',
        branch: 'main',
        headId: 'summary-head',
        messages: [],
        newMessages: [],
        finalAssistantMessage: {
          role: 'assistant',
          content: [
            {
              type: 'response',
              response: [
                {
                  type: 'text',
                  content:
                    '{"title":"Checkpointed workspace","description":"Saved the latest artifact changes and workspace state into a reusable checkpoint summary."}',
                },
              ],
            },
          ],
        },
        turns: 1,
        totalTokens: 0,
        totalCost: 0,
      };
    })();

    return createMockAgentRun(resultPromise, sessionPath);
  });

  await Project.create({ name: 'Route Project' });
  await ArtifactDir.create('route-project', { name: 'Workspace' });

  app = createApp();
});

afterEach(async () => {
  resetSessionRunRegistry();
  await cleanup?.();
  cleanup = null;
});

describe('mounted app checkpoint routes', () => {
  it('creates checkpoint history and rolls unsaved changes back to HEAD', async () => {
    const artifactDir = await ArtifactDir.getById('route-project', 'workspace');
    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'v1', 'utf8');

    const createResponse = await jsonRequest(
      app,
      '/api/projects/route-project/artifacts/workspace/checkpoints',
      'POST'
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      commitHash: string;
      summaryStatus: string;
    };
    expect(created.summaryStatus).toBe('pending');

    await artifactCheckpointService.waitForBackgroundTasks();

    const listAfterCreate = await app.request(
      '/api/projects/route-project/artifacts/workspace/checkpoints'
    );
    expect(listAfterCreate.status).toBe(200);
    expect(await listAfterCreate.json()).toMatchObject({
      hasRepository: true,
      dirty: false,
      headCommitHash: created.commitHash,
      checkpoints: [
        {
          commitHash: created.commitHash,
          summaryStatus: 'ready',
          title: 'Checkpointed workspace',
          description:
            'Saved the latest artifact changes and workspace state into a reusable checkpoint summary.',
          isHead: true,
        },
      ],
    });

    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'v2', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'draft.txt'), 'remove me', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'image.bin'), Buffer.from([0, 255, 16, 8]));
    await mkdir(join(artifactDir.dirPath, '.max', 'temp'), { recursive: true });
    await writeFile(join(artifactDir.dirPath, '.max', 'temp', 'keep.txt'), 'keep me', 'utf8');

    const dirtyListResponse = await app.request(
      '/api/projects/route-project/artifacts/workspace/checkpoints'
    );
    expect(dirtyListResponse.status).toBe(200);
    expect(await dirtyListResponse.json()).toMatchObject({
      hasRepository: true,
      dirty: true,
      headCommitHash: created.commitHash,
    });

    const diffResponse = await app.request(
      '/api/projects/route-project/artifacts/workspace/checkpoints/diff'
    );
    expect(diffResponse.status).toBe(200);
    expect(await diffResponse.json()).toEqual({
      hasRepository: true,
      headCommitHash: created.commitHash,
      dirty: true,
      files: [
        {
          path: 'draft.txt',
          previousPath: null,
          changeType: 'added',
          isBinary: false,
          beforeText: '',
          afterText: 'remove me',
          textTruncated: false,
        },
        {
          path: 'image.bin',
          previousPath: null,
          changeType: 'added',
          isBinary: true,
          beforeText: null,
          afterText: null,
          textTruncated: false,
        },
        {
          path: 'notes.txt',
          previousPath: null,
          changeType: 'modified',
          isBinary: false,
          beforeText: 'v1',
          afterText: 'v2',
          textTruncated: false,
        },
      ],
    });

    const rollbackResponse = await jsonRequest(
      app,
      '/api/projects/route-project/artifacts/workspace/checkpoints/rollback',
      'POST'
    );
    expect(rollbackResponse.status).toBe(200);
    expect(await rollbackResponse.json()).toEqual({
      ok: true,
      reverted: true,
      headCommitHash: created.commitHash,
    });

    expect(await readFile(join(artifactDir.dirPath, 'notes.txt'), 'utf8')).toBe('v1');
    await expect(stat(join(artifactDir.dirPath, 'draft.txt'))).rejects.toThrow();
    expect(await readFile(join(artifactDir.dirPath, '.max', 'temp', 'keep.txt'), 'utf8')).toBe(
      'keep me'
    );
    expect(await readFile(
      join(artifactDir.dataPath, 'checkpoint-summaries', `${created.commitHash}.jsonl`),
      'utf8'
    )).toBe('checkpoint summary session');
  });
});

function createMockAgentRun(resultPromise: Promise<unknown>, sessionPath: string): AgentRun {
  return {
    sessionPath,
    async *[Symbol.asyncIterator]() {
      await resultPromise;
    },
    drain: () => resultPromise as never,
    then: resultPromise.then.bind(resultPromise),
    catch: resultPromise.catch.bind(resultPromise),
    finally: resultPromise.finally.bind(resultPromise),
  } as AgentRun;
}
