import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactDir } from '../../../src/core/artifact-dir/artifact-dir.js';
import {
  ArtifactCheckpointHeadMissingError,
  ArtifactCheckpointNoChangesError,
  ArtifactCheckpointRepositoryMissingError,
} from '../../../src/core/artifact-checkpoint/service.js';
import { setConfig } from '../../../src/core/config.js';
import { Project } from '../../../src/core/project/project.js';
import {
  resetSessionRunRegistry,
  sessionRunRegistry,
} from '../../../src/core/session/run-registry.js';
import { resetTerminalRegistry, terminalRegistry } from '../../../src/core/terminal/terminal-registry.js';
import { createCheckpointRoutes } from '../../../src/routes/checkpoints.js';
import { createFakePtyFactory } from '../../helpers/fake-pty.js';
import { jsonRequest } from '../../helpers/server-fixture.js';

let projectsRoot = '';
let dataRoot = '';
let artifactDir: ArtifactDir;

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-checkpoint-route-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-checkpoint-route-data-'));
  setConfig({ projectsRoot, dataRoot });
  resetSessionRunRegistry();
  resetTerminalRegistry(createFakePtyFactory().factory);

  await Project.create({ name: 'Route Project' });
  artifactDir = await ArtifactDir.create('route-project', { name: 'Workspace' });
});

afterEach(async () => {
  resetSessionRunRegistry();
  resetTerminalRegistry();
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('checkpoint routes', () => {
  it('creates, lists, and rolls back checkpoints with the local DTOs', async () => {
    const checkpoint = {
      commitHash: '1234567890abcdef',
      shortHash: '1234567',
      createdAt: '2026-04-01T00:00:00.000Z',
      summaryStatus: 'pending' as const,
      title: null,
      description: null,
      isHead: true,
    };
    const diff = {
      hasRepository: true,
      headCommitHash: checkpoint.commitHash,
      dirty: true,
      files: [
        {
          path: 'notes.txt',
          previousPath: null,
          changeType: 'modified' as const,
          isBinary: false,
          beforeText: 'before',
          afterText: 'after',
          textTruncated: false,
        },
      ],
    };
    const mockService = {
      createCheckpoint: vi.fn().mockResolvedValue(checkpoint),
      listCheckpoints: vi.fn().mockResolvedValue({
        hasRepository: true,
        dirty: false,
        headCommitHash: checkpoint.commitHash,
        checkpoints: [checkpoint],
      }),
      getDiff: vi.fn().mockResolvedValue(diff),
      rollbackToHead: vi.fn().mockResolvedValue({
        ok: true,
        reverted: true,
        headCommitHash: checkpoint.commitHash,
      }),
    };
    const routes = createCheckpointRoutes({
      checkpointService: mockService as never,
    });

    const createResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints',
      'POST'
    );
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toEqual(checkpoint);

    const listResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints',
      'GET'
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({
      hasRepository: true,
      dirty: false,
      headCommitHash: checkpoint.commitHash,
      checkpoints: [checkpoint],
    });

    const diffResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints/diff',
      'GET'
    );
    expect(diffResponse.status).toBe(200);
    expect(await diffResponse.json()).toEqual(diff);

    const rollbackResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints/rollback',
      'POST'
    );
    expect(rollbackResponse.status).toBe(200);
    expect(await rollbackResponse.json()).toEqual({
      ok: true,
      reverted: true,
      headCommitHash: checkpoint.commitHash,
    });

    expect(mockService.createCheckpoint).toHaveBeenCalledWith('route-project', 'workspace');
    expect(mockService.listCheckpoints).toHaveBeenCalledWith('route-project', 'workspace');
    expect(mockService.getDiff).toHaveBeenCalledWith('route-project', 'workspace');
    expect(mockService.rollbackToHead).toHaveBeenCalledWith('route-project', 'workspace');
  });

  it('maps checkpoint write and rollback errors to the documented 409 responses', async () => {
    const routes = createCheckpointRoutes({
      checkpointService: {
        createCheckpoint: vi.fn().mockRejectedValue(new ArtifactCheckpointNoChangesError()),
        listCheckpoints: vi.fn(),
        getDiff: vi.fn(),
        rollbackToHead: vi
          .fn()
          .mockRejectedValueOnce(new ArtifactCheckpointRepositoryMissingError())
          .mockRejectedValueOnce(new ArtifactCheckpointHeadMissingError()),
      } as never,
    });

    const createResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints',
      'POST'
    );
    expect(createResponse.status).toBe(409);
    expect(await createResponse.json()).toEqual({
      error: 'No changes to checkpoint',
    });

    const repoMissingResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints/rollback',
      'POST'
    );
    expect(repoMissingResponse.status).toBe(409);
    expect(await repoMissingResponse.json()).toEqual({
      error: 'Artifact checkpoint repository not initialized',
    });

    const headMissingResponse = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints/rollback',
      'POST'
    );
    expect(headMissingResponse.status).toBe(409);
    expect(await headMissingResponse.json()).toEqual({
      error: 'Artifact checkpoint HEAD is missing',
    });
  });

  it('blocks checkpoint writes when the artifact has a running terminal', async () => {
    terminalRegistry.createTerminal({
      projectId: 'route-project',
      artifactId: 'workspace',
      cwd: artifactDir.dirPath,
    });

    const routes = createCheckpointRoutes({
      checkpointService: {
        createCheckpoint: vi.fn(),
        listCheckpoints: vi.fn(),
        getDiff: vi.fn(),
        rollbackToHead: vi.fn(),
      } as never,
    });

    const response = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints',
      'POST'
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('running terminal'),
      terminal: expect.objectContaining({
        artifactId: 'workspace',
        status: 'running',
      }),
    });
  });

  it('blocks rollback when the artifact has an active live run', async () => {
    sessionRunRegistry.startRun({
      sessionKey: 'route-project:workspace:session-a',
      sessionId: 'session-a',
      mode: 'prompt',
      execute: async () => new Promise(() => undefined),
    });

    const routes = createCheckpointRoutes({
      checkpointService: {
        createCheckpoint: vi.fn(),
        listCheckpoints: vi.fn(),
        getDiff: vi.fn(),
        rollbackToHead: vi.fn(),
      } as never,
    });

    const response = await jsonRequest(
      routes,
      '/projects/route-project/artifacts/workspace/checkpoints/rollback',
      'POST'
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Artifact directory "workspace" has an active live run and cannot be checkpointed right now',
    });
  });
});
