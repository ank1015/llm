import { Hono } from 'hono';

import {
  artifactCheckpointService,
  ArtifactCheckpointHeadMissingError,
  ArtifactCheckpointNoChangesError,
  ArtifactCheckpointRepositoryMissingError,
} from '../core/index.js';
import { sessionRunRegistry } from '../core/session/run-registry.js';
import { terminalRegistry } from '../core/terminal/terminal-registry.js';
import {
  toArtifactCheckpointDto,
  toArtifactCheckpointDiffResponse,
  toArtifactCheckpointListResponse,
  toTerminalSummaryDto,
} from '../http/contracts.js';

import type {
  ArtifactCheckpointDto,
  ArtifactCheckpointDiffResponse,
  ArtifactCheckpointListResponse,
  ArtifactCheckpointRollbackResponse,
  TerminalConflictResponse,
} from '../contracts/index.js';

const BASE = '/projects/:projectId/artifacts/:artifactDirId/checkpoints';

export function createCheckpointRoutes(
  dependencies: {
    checkpointService?: typeof artifactCheckpointService;
  } = {}
): Hono {
  const checkpointService = dependencies.checkpointService ?? artifactCheckpointService;
  const checkpointRoutes = new Hono();

  checkpointRoutes.post(BASE, async (c) => {
    const { projectId, artifactDirId } = c.req.param();
    const conflict = resolveArtifactMutationConflict(projectId, artifactDirId);
    if (conflict) {
      return conflict;
    }

    try {
      const checkpoint = await checkpointService.createCheckpoint(projectId, artifactDirId);
      return c.json<ArtifactCheckpointDto>(toArtifactCheckpointDto(checkpoint), 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create checkpoint';
      return c.json({ error: message }, classifyCheckpointWriteErrorStatus(error));
    }
  });

  checkpointRoutes.get(BASE, async (c) => {
    const { projectId, artifactDirId } = c.req.param();

    try {
      const result = await checkpointService.listCheckpoints(projectId, artifactDirId);
      return c.json<ArtifactCheckpointListResponse>(toArtifactCheckpointListResponse(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list checkpoints';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  checkpointRoutes.get(`${BASE}/diff`, async (c) => {
    const { projectId, artifactDirId } = c.req.param();

    try {
      const result = await checkpointService.getDiff(projectId, artifactDirId);
      return c.json<ArtifactCheckpointDiffResponse>(toArtifactCheckpointDiffResponse(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read checkpoint diff';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  checkpointRoutes.post(`${BASE}/rollback`, async (c) => {
    const { projectId, artifactDirId } = c.req.param();
    const conflict = resolveArtifactMutationConflict(projectId, artifactDirId);
    if (conflict) {
      return conflict;
    }

    try {
      const result = await checkpointService.rollbackToHead(projectId, artifactDirId);
      return c.json<ArtifactCheckpointRollbackResponse>(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rollback checkpoint state';
      return c.json({ error: message }, classifyCheckpointRollbackErrorStatus(error));
    }
  });

  return checkpointRoutes;
}

export const checkpointRoutes = createCheckpointRoutes();

function resolveArtifactMutationConflict(projectId: string, artifactDirId: string): Response | null {
  const runningTerminal = terminalRegistry.getRunningTerminalForArtifact(projectId, artifactDirId);
  if (runningTerminal) {
    return new Response(
      JSON.stringify({
        error: `Artifact directory "${artifactDirId}" has a running terminal and cannot be checkpointed right now`,
        terminal: toTerminalSummaryDto(runningTerminal),
      } satisfies TerminalConflictResponse),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (sessionRunRegistry.hasActiveRunForArtifact(projectId, artifactDirId)) {
    return new Response(
      JSON.stringify({
        error: `Artifact directory "${artifactDirId}" has an active live run and cannot be checkpointed right now`,
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

function classifyCheckpointWriteErrorStatus(error: unknown): 404 | 409 | 500 {
  if (error instanceof ArtifactCheckpointNoChangesError) {
    return 409;
  }

  const message = error instanceof Error ? error.message : '';
  if (message.includes('not found')) {
    return 404;
  }

  return 500;
}

function classifyCheckpointRollbackErrorStatus(error: unknown): 404 | 409 | 500 {
  if (
    error instanceof ArtifactCheckpointRepositoryMissingError ||
    error instanceof ArtifactCheckpointHeadMissingError
  ) {
    return 409;
  }

  const message = error instanceof Error ? error.message : '';
  if (message.includes('not found')) {
    return 404;
  }

  return 500;
}
