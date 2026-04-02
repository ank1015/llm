import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getConfig, setConfig } from '../../../../src/core/config.js';
import {
  appendSessionCompactionNode,
  createSessionCompactionNode,
  deleteSessionCompactionSidecar,
  getSessionCompactionNodes,
  getSessionCompactionSidecarPath,
} from '../../../../src/core/session/compaction-storage.js';

const PROJECT_ID = 'compaction-project';
const ARTIFACT_ID = 'compaction-artifact';
const SESSION_ID = 'session-123';

let projectsRoot = '';
let dataRoot = '';
let previousConfig = getConfig();

beforeEach(async () => {
  previousConfig = getConfig();
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-compaction-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-compaction-data-'));
  setConfig({ projectsRoot, dataRoot });
});

afterEach(async () => {
  setConfig(previousConfig);
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('session compaction storage', () => {
  it('appends compaction nodes to a session-local sidecar jsonl and reads them back in order', async () => {
    const first = await appendSessionCompactionNode(PROJECT_ID, ARTIFACT_ID, SESSION_ID, {
      type: 'turn_compact',
      branchName: 'main',
      firstNodeId: 'user-1',
      lastNodeId: 'assistant-1',
      compactionSummary: 'Read /tmp/project/src/app.ts and updated the main logic.',
    });
    const second = await appendSessionCompactionNode(PROJECT_ID, ARTIFACT_ID, SESSION_ID, {
      type: 'ongoing_turn_compact',
      branchName: 'main',
      firstNodeId: 'user-2',
      lastNodeId: 'tool-5',
      compactionSummary: 'Ran tests, hit a type error, and switched to a narrower fix.',
    });

    expect(first.id).toEqual(expect.any(String));
    expect(first.createdAt).toEqual(expect.any(String));
    expect(second.id).toEqual(expect.any(String));
    expect(second.createdAt).toEqual(expect.any(String));

    const sidecarPath = getSessionCompactionSidecarPath(PROJECT_ID, ARTIFACT_ID, SESSION_ID);
    expect(sidecarPath).toBe(
      join(
        dataRoot,
        PROJECT_ID,
        'artifacts',
        ARTIFACT_ID,
        'sessions',
        'meta',
        `${SESSION_ID}.compactions.jsonl`
      )
    );

    const rawContent = await readFile(sidecarPath, 'utf8');
    expect(rawContent.trim().split('\n')).toHaveLength(2);

    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual([
      first,
      second,
    ]);
  });

  it('returns an empty list when no session compaction sidecar exists', async () => {
    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual(
      []
    );
  });

  it('creates persisted compaction nodes directly and deletes the sidecar when requested', async () => {
    const node = createSessionCompactionNode({
      type: 'ultra_compact',
      branchName: 'retry-branch',
      firstNodeId: 'user-10',
      lastNodeId: 'assistant-20',
      compactionSummary: 'Compressed older planning and implementation turns into one summary.',
    });

    expect(node).toMatchObject({
      type: 'ultra_compact',
      branchName: 'retry-branch',
      firstNodeId: 'user-10',
      lastNodeId: 'assistant-20',
      compactionSummary: 'Compressed older planning and implementation turns into one summary.',
    });

    await appendSessionCompactionNode(PROJECT_ID, ARTIFACT_ID, SESSION_ID, node);
    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual([
      node,
    ]);

    await deleteSessionCompactionSidecar(PROJECT_ID, ARTIFACT_ID, SESSION_ID);
    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual(
      []
    );
  });

  it('reads legacy beforeNodeId/afterNodeId fields and normalizes them to firstNodeId/lastNodeId', async () => {
    const sidecarPath = getSessionCompactionSidecarPath(PROJECT_ID, ARTIFACT_ID, SESSION_ID);
    await mkdir(join(dataRoot, PROJECT_ID, 'artifacts', ARTIFACT_ID, 'sessions', 'meta'), {
      recursive: true,
    });
    await writeFile(
      sidecarPath,
      `${JSON.stringify({
        id: 'legacy-node',
        type: 'turn_compact',
        createdAt: '2026-01-01T00:00:00.000Z',
        branchName: 'main',
        beforeNodeId: 'assistant-1',
        afterNodeId: 'tool-1',
        compactionSummary: 'Legacy compaction summary.',
      })}\n`,
      'utf8'
    );

    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual([
      {
        id: 'legacy-node',
        type: 'turn_compact',
        createdAt: '2026-01-01T00:00:00.000Z',
        branchName: 'main',
        firstNodeId: 'assistant-1',
        lastNodeId: 'tool-1',
        compactionSummary: 'Legacy compaction summary.',
      },
    ]);
  });
});
