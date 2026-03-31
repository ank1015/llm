import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactDir } from '../../../src/core/artifact-dir/artifact-dir.js';
import {
  ArtifactCheckpointNoChangesError,
  ArtifactCheckpointService,
} from '../../../src/core/artifact-checkpoint/service.js';
import { setConfig } from '../../../src/core/config.js';
import { Project } from '../../../src/core/project/project.js';

import type { AgentInput, AgentRun, AgentTool } from '@ank1015/llm-sdk';
import type { ArtifactCheckpointMetadata } from '../../../src/types/index.js';

const execFileAsync = promisify(execFile);

const PROJECT_ID = 'checkpoint-project';
const ARTIFACT_ID = 'workspace';

let projectsRoot = '';
let dataRoot = '';
let artifactDir: ArtifactDir;

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-checkpoint-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-checkpoint-data-'));
  setConfig({ projectsRoot, dataRoot });

  await Project.create({ name: 'Checkpoint Project' });
  artifactDir = await ArtifactDir.create(PROJECT_ID, { name: 'Workspace' });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('ArtifactCheckpointService', () => {
  it('creates the first checkpoint, snapshots checkpointable files, and summarizes it asynchronously', async () => {
    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'artifact state', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'image.bin'), Buffer.from([0, 255, 16, 8]));
    await mkdir(join(artifactDir.dirPath, '.max', 'user-artifacts'), { recursive: true });
    await mkdir(join(artifactDir.dirPath, '.max', 'temp'), { recursive: true });
    await mkdir(join(artifactDir.dirPath, '.max', 'skills'), { recursive: true });
    await writeFile(
      join(artifactDir.dirPath, '.max', 'user-artifacts', 'upload.txt'),
      'uploaded context',
      'utf8'
    );
    await writeFile(join(artifactDir.dirPath, '.max', 'temp', 'scratch.txt'), 'scratch', 'utf8');
    await writeFile(join(artifactDir.dirPath, '.max', 'skills', 'helper.txt'), 'helper', 'utf8');

    let resolveSummary: (() => void) | null = null;
    const summaryGate = new Promise<void>((resolve) => {
      resolveSummary = resolve;
    });
    const promptCalls: Array<Record<string, string>> = [];
    const agentCalls: AgentInput[] = [];

    const service = new ArtifactCheckpointService({
      createSummaryPrompt: (options) => {
        promptCalls.push(options);
        return 'checkpoint summary prompt';
      },
      runAgent: ((input: AgentInput) => {
        agentCalls.push(input);
        const sessionPath = (input.session as { path?: string } | undefined)?.path;
        if (sessionPath) {
          void mkdir(dirname(sessionPath), { recursive: true }).then(() => {
            return writeFile(sessionPath, 'summary session', 'utf8');
          });
        }

        const resultPromise = summaryGate.then(() => {
          return {
            ok: true,
            sessionPath: sessionPath ?? '',
            sessionId: 'summary-session',
            branch: 'main',
            headId: 'summary-head',
            messages: [],
            newMessages: [],
            finalAssistantMessage: buildAssistantMessage(
              '{"title":"Refine artifact snapshot","description":"Captured the current workspace files, including uploaded user artifacts, as a reusable checkpoint."}'
            ),
            turns: 1,
            totalTokens: 0,
            totalCost: 0,
          };
        });

        return createMockAgentRun(resultPromise, sessionPath ?? '');
      }) as typeof import('@ank1015/llm-sdk').agent,
    });

    const checkpoint = await service.createCheckpoint(PROJECT_ID, ARTIFACT_ID);

    expect(checkpoint.summaryStatus).toBe('pending');
    expect(checkpoint.isHead).toBe(true);
    await eventually(() => {
      expect(agentCalls).toHaveLength(1);
    });
    expect(agentCalls[0]?.modelId).toBe('google/gemini-3-flash-preview');
    expect((agentCalls[0]?.tools as AgentTool[] | undefined)?.length).toBeGreaterThan(0);
    expect(promptCalls).toEqual([
      {
        projectName: 'Checkpoint Project',
        projectDir: join(projectsRoot, PROJECT_ID),
        artifactName: 'Workspace',
        artifactDir: join(projectsRoot, PROJECT_ID, ARTIFACT_ID),
      },
    ]);

    const pendingMetadata = await readCheckpointMetadata(artifactDir.dataPath, checkpoint.commitHash);
    expect(pendingMetadata).toMatchObject({
      commitHash: checkpoint.commitHash,
      summaryStatus: 'pending',
      title: null,
      description: null,
    });

    const trackedFiles = await git(artifactDir.dirPath, ['ls-tree', '-r', '--name-only', 'HEAD']);
    expect(trackedFiles.split('\n')).toEqual(
      expect.arrayContaining(['notes.txt', 'image.bin', '.max/user-artifacts/upload.txt'])
    );
    expect(trackedFiles).not.toContain('.max/temp/scratch.txt');
    expect(trackedFiles).not.toContain('.max/skills/helper.txt');

    resolveSummary?.();
    await service.waitForBackgroundTasks();

    const metadata = await readCheckpointMetadata(artifactDir.dataPath, checkpoint.commitHash);
    expect(metadata).toMatchObject({
      summaryStatus: 'ready',
      title: 'Refine artifact snapshot',
      description:
        'Captured the current workspace files, including uploaded user artifacts, as a reusable checkpoint.',
    });

    const summarySessionPath = join(
      artifactDir.dataPath,
      'checkpoint-summaries',
      `${checkpoint.commitHash}.jsonl`
    );
    expect(await readFile(summarySessionPath, 'utf8')).toBe('summary session');
  });

  it('lists checkpoints newest-first and falls back to git subjects for manual commits', async () => {
    const service = new ArtifactCheckpointService({
      runAgent: ((input: AgentInput) => {
        const sessionPath = (input.session as { path?: string } | undefined)?.path ?? '';
        return createMockAgentRun(
          Promise.resolve({
            ok: true,
            sessionPath,
            sessionId: 'summary-session',
            branch: 'main',
            headId: 'summary-head',
            messages: [],
            newMessages: [],
            finalAssistantMessage: buildAssistantMessage(
              '{"title":"Checkpoint saved","description":"Saved the latest artifact edits into a named checkpoint summary."}'
            ),
            turns: 1,
            totalTokens: 0,
            totalCost: 0,
          }),
          sessionPath
        );
      }) as typeof import('@ank1015/llm-sdk').agent,
    });

    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'first', 'utf8');
    const first = await service.createCheckpoint(PROJECT_ID, ARTIFACT_ID);
    await service.waitForBackgroundTasks();

    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'second', 'utf8');
    const second = await service.createCheckpoint(PROJECT_ID, ARTIFACT_ID);
    await service.waitForBackgroundTasks();

    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'manual', 'utf8');
    await git(artifactDir.dirPath, ['add', '--all', '--force', '--', '.']);
    await git(artifactDir.dirPath, [
      'commit',
      '--quiet',
      '-m',
      'manual artifact update',
      '-m',
      'Updated the workspace outside the checkpoint endpoint.',
    ]);
    const manualHead = (await git(artifactDir.dirPath, ['rev-parse', 'HEAD'])).trim();

    const history = await service.listCheckpoints(PROJECT_ID, ARTIFACT_ID);

    expect(history.hasRepository).toBe(true);
    expect(history.headCommitHash).toBe(manualHead);
    expect(history.checkpoints).toHaveLength(3);
    expect(history.checkpoints[0]).toMatchObject({
      commitHash: manualHead,
      summaryStatus: 'unavailable',
      title: 'manual artifact update',
      description: 'Updated the workspace outside the checkpoint endpoint.',
      isHead: true,
    });
    expect(history.checkpoints[1]).toMatchObject({
      commitHash: second.commitHash,
      summaryStatus: 'ready',
    });
    expect(history.checkpoints[2]).toMatchObject({
      commitHash: first.commitHash,
      summaryStatus: 'ready',
    });
  });

  it('rejects checkpoint creation when there are no changes to save', async () => {
    const service = new ArtifactCheckpointService({
      runAgent: ((input: AgentInput) => {
        const sessionPath = (input.session as { path?: string } | undefined)?.path ?? '';
        return createMockAgentRun(
          Promise.resolve({
            ok: true,
            sessionPath,
            sessionId: 'summary-session',
            branch: 'main',
            headId: 'summary-head',
            messages: [],
            newMessages: [],
            finalAssistantMessage: buildAssistantMessage(
              '{"title":"Unused checkpoint","description":"This summary should never be written because the checkpoint fails first."}'
            ),
            turns: 1,
            totalTokens: 0,
            totalCost: 0,
          }),
          sessionPath
        );
      }) as typeof import('@ank1015/llm-sdk').agent,
    });

    await expect(service.createCheckpoint(PROJECT_ID, ARTIFACT_ID)).rejects.toBeInstanceOf(
      ArtifactCheckpointNoChangesError
    );
  });

  it('rolls back dirty tracked, staged, ignored, and untracked changes while preserving temp state', async () => {
    const service = new ArtifactCheckpointService({
      runAgent: ((input: AgentInput) => {
        const sessionPath = (input.session as { path?: string } | undefined)?.path ?? '';
        return createMockAgentRun(
          Promise.resolve({
            ok: true,
            sessionPath,
            sessionId: 'summary-session',
            branch: 'main',
            headId: 'summary-head',
            messages: [],
            newMessages: [],
            finalAssistantMessage: buildAssistantMessage(
              '{"title":"Seed checkpoint","description":"Saved a clean checkpoint to verify rollback behavior later."}'
            ),
            turns: 1,
            totalTokens: 0,
            totalCost: 0,
          }),
          sessionPath
        );
      }) as typeof import('@ank1015/llm-sdk').agent,
    });

    await writeFile(join(artifactDir.dirPath, '.gitignore'), 'ignored.txt\n', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'tracked.txt'), 'v1', 'utf8');
    await service.createCheckpoint(PROJECT_ID, ARTIFACT_ID);
    await service.waitForBackgroundTasks();

    await writeFile(join(artifactDir.dirPath, 'tracked.txt'), 'v2', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'staged.txt'), 'stage me', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'ignored.txt'), 'ignored but checkpointable', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'untracked.txt'), 'remove me', 'utf8');
    await mkdir(join(artifactDir.dirPath, '.max', 'temp'), { recursive: true });
    await mkdir(join(artifactDir.dirPath, '.max', 'skills'), { recursive: true });
    await writeFile(join(artifactDir.dirPath, '.max', 'temp', 'keep.txt'), 'keep temp', 'utf8');
    await writeFile(join(artifactDir.dirPath, '.max', 'skills', 'keep.txt'), 'keep skill', 'utf8');
    await git(artifactDir.dirPath, ['add', 'staged.txt']);

    const dirtyBeforeRollback = await service.listCheckpoints(PROJECT_ID, ARTIFACT_ID);
    expect(dirtyBeforeRollback.dirty).toBe(true);

    const rollback = await service.rollbackToHead(PROJECT_ID, ARTIFACT_ID);
    expect(rollback).toMatchObject({
      ok: true,
      reverted: true,
    });

    expect(await readFile(join(artifactDir.dirPath, 'tracked.txt'), 'utf8')).toBe('v1');
    await expect(stat(join(artifactDir.dirPath, 'staged.txt'))).rejects.toThrow();
    await expect(stat(join(artifactDir.dirPath, 'ignored.txt'))).rejects.toThrow();
    await expect(stat(join(artifactDir.dirPath, 'untracked.txt'))).rejects.toThrow();
    expect(await readFile(join(artifactDir.dirPath, '.max', 'temp', 'keep.txt'), 'utf8')).toBe(
      'keep temp'
    );
    expect(await readFile(join(artifactDir.dirPath, '.max', 'skills', 'keep.txt'), 'utf8')).toBe(
      'keep skill'
    );

    const dirtyAfterRollback = await service.listCheckpoints(PROJECT_ID, ARTIFACT_ID);
    expect(dirtyAfterRollback.dirty).toBe(false);
  });

  it('returns an initial diff against an empty baseline before the first checkpoint', async () => {
    const service = new ArtifactCheckpointService();

    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'draft notes', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'image.bin'), Buffer.from([0, 255, 16, 8]));
    await mkdir(join(artifactDir.dirPath, '.max', 'user-artifacts'), { recursive: true });
    await mkdir(join(artifactDir.dirPath, '.max', 'temp'), { recursive: true });
    await mkdir(join(artifactDir.dirPath, '.max', 'skills'), { recursive: true });
    await writeFile(
      join(artifactDir.dirPath, '.max', 'user-artifacts', 'upload.txt'),
      'uploaded context',
      'utf8'
    );
    await writeFile(join(artifactDir.dirPath, '.max', 'temp', 'scratch.txt'), 'scratch', 'utf8');
    await writeFile(join(artifactDir.dirPath, '.max', 'skills', 'helper.txt'), 'helper', 'utf8');

    const diff = await service.getDiff(PROJECT_ID, ARTIFACT_ID);

    expect(diff).toMatchObject({
      hasRepository: false,
      headCommitHash: null,
      dirty: true,
    });
    expect(diff.files).toEqual(
      expect.arrayContaining([
        {
          path: '.max/user-artifacts/upload.txt',
          previousPath: null,
          changeType: 'added',
          isBinary: false,
          beforeText: '',
          afterText: 'uploaded context',
          textTruncated: false,
        },
        {
          path: 'notes.txt',
          previousPath: null,
          changeType: 'added',
          isBinary: false,
          beforeText: '',
          afterText: 'draft notes',
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
      ])
    );
    expect(diff.files.map((file) => file.path)).not.toContain('.max/temp/scratch.txt');
    expect(diff.files.map((file) => file.path)).not.toContain('.max/skills/helper.txt');
  });

  it('returns working tree diffs against HEAD for modified, added, deleted, and renamed files', async () => {
    const service = new ArtifactCheckpointService({
      runAgent: ((input: AgentInput) => {
        const sessionPath = (input.session as { path?: string } | undefined)?.path ?? '';
        return createMockAgentRun(
          Promise.resolve({
            ok: true,
            sessionPath,
            sessionId: 'summary-session',
            branch: 'main',
            headId: 'summary-head',
            messages: [],
            newMessages: [],
            finalAssistantMessage: buildAssistantMessage(
              '{"title":"Seed checkpoint","description":"Saved a clean checkpoint to inspect diffs later."}'
            ),
            turns: 1,
            totalTokens: 0,
            totalCost: 0,
          }),
          sessionPath
        );
      }) as typeof import('@ank1015/llm-sdk').agent,
    });

    await writeFile(join(artifactDir.dirPath, 'modified.txt'), 'before', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'deleted.txt'), 'delete me', 'utf8');
    await writeFile(join(artifactDir.dirPath, 'rename-me.txt'), 'rename me', 'utf8');
    const checkpoint = await service.createCheckpoint(PROJECT_ID, ARTIFACT_ID);
    await service.waitForBackgroundTasks();

    await writeFile(join(artifactDir.dirPath, 'modified.txt'), 'after', 'utf8');
    await rm(join(artifactDir.dirPath, 'deleted.txt'));
    await writeFile(join(artifactDir.dirPath, 'added.txt'), 'brand new', 'utf8');
    await git(artifactDir.dirPath, ['mv', 'rename-me.txt', 'renamed.txt']);

    const diff = await service.getDiff(PROJECT_ID, ARTIFACT_ID);

    expect(diff).toMatchObject({
      hasRepository: true,
      headCommitHash: checkpoint.commitHash,
      dirty: true,
    });
    expect(diff.files).toEqual(
      expect.arrayContaining([
        {
          path: 'added.txt',
          previousPath: null,
          changeType: 'added',
          isBinary: false,
          beforeText: '',
          afterText: 'brand new',
          textTruncated: false,
        },
        {
          path: 'deleted.txt',
          previousPath: null,
          changeType: 'deleted',
          isBinary: false,
          beforeText: 'delete me',
          afterText: '',
          textTruncated: false,
        },
        {
          path: 'modified.txt',
          previousPath: null,
          changeType: 'modified',
          isBinary: false,
          beforeText: 'before',
          afterText: 'after',
          textTruncated: false,
        },
        {
          path: 'renamed.txt',
          previousPath: 'rename-me.txt',
          changeType: 'renamed',
          isBinary: false,
          beforeText: 'rename me',
          afterText: 'rename me',
          textTruncated: false,
        },
      ])
    );
  });

  it('marks the checkpoint summary as failed when the summary agent returns malformed JSON', async () => {
    const service = new ArtifactCheckpointService({
      runAgent: ((input: AgentInput) => {
        const sessionPath = (input.session as { path?: string } | undefined)?.path ?? '';
        return createMockAgentRun(
          Promise.resolve({
            ok: true,
            sessionPath,
            sessionId: 'summary-session',
            branch: 'main',
            headId: 'summary-head',
            messages: [],
            newMessages: [],
            finalAssistantMessage: buildAssistantMessage('not valid json'),
            turns: 1,
            totalTokens: 0,
            totalCost: 0,
          }),
          sessionPath
        );
      }) as typeof import('@ank1015/llm-sdk').agent,
    });

    await writeFile(join(artifactDir.dirPath, 'notes.txt'), 'fail summary', 'utf8');
    const checkpoint = await service.createCheckpoint(PROJECT_ID, ARTIFACT_ID);
    await service.waitForBackgroundTasks();

    const metadata = await readCheckpointMetadata(artifactDir.dataPath, checkpoint.commitHash);
    expect(metadata.summaryStatus).toBe('failed');
    expect(metadata.summaryError).toContain('Unexpected token');
    expect(metadata.summaryStartedAt).toBeTruthy();
    expect(metadata.summaryFinishedAt).toBeTruthy();
  });
});

function buildAssistantMessage(text: string) {
  return {
    role: 'assistant',
    content: [
      {
        type: 'response',
        response: [{ type: 'text', content: text }],
      },
    ],
  } as const;
}

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

async function readCheckpointMetadata(
  artifactDataPath: string,
  commitHash: string
): Promise<ArtifactCheckpointMetadata> {
  const content = await readFile(join(artifactDataPath, 'checkpoints', `${commitHash}.json`), 'utf8');
  return JSON.parse(content) as ArtifactCheckpointMetadata;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return `${result.stdout ?? ''}`.trimEnd();
}

async function eventually(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();

  while (true) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
