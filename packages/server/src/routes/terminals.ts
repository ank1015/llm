import { CreateTerminalRequestSchema } from '../contracts/index.js';
import { Hono } from 'hono';

import { ArtifactDir } from '../core/index.js';
import { terminalRegistry } from '../core/terminal/terminal-registry.js';
import { toTerminalMetadataDto, toTerminalSummaryDto } from '../http/contracts.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  CreateTerminalRequest,
  DeleteTerminalResponse,
  TerminalMetadataDto,
  TerminalSummaryDto,
} from '../contracts/index.js';

const BASE = '/projects/:projectId/artifacts/:artifactDirId/terminals';
const TERMINAL_NOT_FOUND_MESSAGE = 'Terminal not found';
const ARTIFACT_NOT_FOUND_MESSAGE = 'Artifact directory not found';
const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';

export const terminalRoutes = new Hono();

terminalRoutes.post(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      CreateTerminalRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as CreateTerminalRequest;

  try {
    const artifactDir = await ArtifactDir.getById(projectId, artifactDirId);
    const metadata = terminalRegistry.createTerminal({
      projectId,
      artifactId: artifactDirId,
      cwd: artifactDir.dirPath,
      options: body,
    });
    return c.json<TerminalMetadataDto>(toTerminalMetadataDto(metadata), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create terminal';
    const status = message.includes('not found') ? 404 : 500;
    return c.json({ error: message }, status);
  }
});

terminalRoutes.get(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    await ArtifactDir.getById(projectId, artifactDirId);
    const terminals = terminalRegistry.listTerminals(projectId, artifactDirId);
    return c.json<TerminalSummaryDto[]>(terminals.map(toTerminalSummaryDto));
  } catch (error) {
    const message = error instanceof Error ? error.message : ARTIFACT_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

terminalRoutes.get(`${BASE}/:terminalId`, async (c) => {
  const { projectId, artifactDirId, terminalId } = c.req.param();

  try {
    await ArtifactDir.getById(projectId, artifactDirId);
    const metadata = terminalRegistry.getTerminal(projectId, artifactDirId, terminalId);
    if (!metadata) {
      return c.json({ error: TERMINAL_NOT_FOUND_MESSAGE }, 404);
    }

    return c.json<TerminalMetadataDto>(toTerminalMetadataDto(metadata));
  } catch (error) {
    const message = error instanceof Error ? error.message : ARTIFACT_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

terminalRoutes.delete(`${BASE}/:terminalId`, async (c) => {
  const { projectId, artifactDirId, terminalId } = c.req.param();

  try {
    await ArtifactDir.getById(projectId, artifactDirId);
    const deleted = terminalRegistry.deleteTerminal(projectId, artifactDirId, terminalId);
    if (!deleted) {
      return c.json({ error: TERMINAL_NOT_FOUND_MESSAGE }, 404);
    }

    return c.json<DeleteTerminalResponse>({ deleted: true, terminalId });
  } catch (error) {
    const message = error instanceof Error ? error.message : ARTIFACT_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});
