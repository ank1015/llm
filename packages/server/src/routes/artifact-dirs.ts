import { Hono } from 'hono';

import {
  ArtifactExplorerQuerySchema,
  ArtifactFileQuerySchema,
  ArtifactRawFileQuerySchema,
  CreateArtifactDirRequestSchema,
  DeleteArtifactPathQuerySchema,
  InstallArtifactSkillRequestSchema,
  RenameArtifactDirRequestSchema,
  RenameArtifactPathRequestSchema,
  UpdateArtifactFileRequestSchema,
} from '../contracts/index.js';
import {
  ArtifactSkillAlreadyInstalledError,
  ArtifactSkillNotInstalledError,
  ArtifactSkillSourceError,
  UnknownArtifactSkillError,
} from '../core/artifact-dir/skills.js';
import { ArtifactDir } from '../core/index.js';
import { sessionRunRegistry } from '../core/session/run-registry.js';
import { terminalRegistry } from '../core/terminal/terminal-registry.js';
import {
  toArtifactDirDto,
  toArtifactInstalledSkillDto,
  toDeleteArtifactSkillResponse,
  toTerminalSummaryDto,
} from '../http/contracts.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  ArtifactDirDeleteResponse,
  ArtifactDirDto,
  ArtifactExplorerQuery,
  ArtifactExplorerResult,
  ArtifactFileDto,
  ArtifactFileQuery,
  ArtifactFilesListResponse,
  ArtifactInstalledSkillDto,
  ArtifactRawFileQuery,
  CreateArtifactDirRequest,
  DeleteArtifactSkillResponse,
  DeleteArtifactPathQuery,
  DeleteArtifactPathResponse,
  InstallArtifactSkillRequest,
  RenameArtifactDirRequest,
  RenameArtifactPathRequest,
  RenameArtifactPathResponse,
  TerminalConflictResponse,
  UpdateArtifactFileRequest,
} from '../contracts/index.js';

const BASE = '/projects/:projectId/artifacts';
const NOT_FOUND_MSG = 'Artifact directory not found';
const FILE_READ_DEFAULT_MAX_BYTES = 200_000;
const PATH_QUERY_REQUIRED_MESSAGE = 'path query parameter is required';
const SKILL_NAME_REQUIRED_MESSAGE = 'skillName is required';
const NOT_FOUND_IN_PROJECT_FRAGMENT = 'not found in project';
const INVALID_PATH_MESSAGE = 'Invalid path';
const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';
const INVALID_QUERY_PARAMETERS_MESSAGE = 'Invalid query parameters';
const NAME_REQUIRED_MESSAGE = 'name is required';

export const artifactDirRoutes = new Hono();

/** POST /api/projects/:projectId/artifacts — Create a new artifact directory */
artifactDirRoutes.post(BASE, async (c) => {
  const { projectId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      CreateArtifactDirRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as CreateArtifactDirRequest;
  const name = body.name?.trim() ?? '';

  if (!name) {
    return c.json({ error: NAME_REQUIRED_MESSAGE }, 400);
  }

  try {
    const input = { name } as { name: string; description?: string };
    if (body.description?.trim()) input.description = body.description.trim();
    const dir = await ArtifactDir.create(projectId, input);
    const metadata = await dir.getMetadata();
    return c.json<ArtifactDirDto>(toArtifactDirDto(metadata), 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create artifact directory';
    return c.json({ error: message }, 409);
  }
});

/** GET /api/projects/:projectId/artifacts — List artifact directories */
artifactDirRoutes.get(BASE, async (c) => {
  const { projectId } = c.req.param();
  const dirs = await ArtifactDir.list(projectId);
  return c.json<ArtifactDirDto[]>(dirs.map(toArtifactDirDto));
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId — Get a single artifact directory */
artifactDirRoutes.get(`${BASE}/:artifactDirId`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const metadata = await dir.getMetadata();
    return c.json<ArtifactDirDto>(toArtifactDirDto(metadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

/** PATCH /api/projects/:projectId/artifacts/:artifactDirId/name — Rename an artifact directory */
artifactDirRoutes.patch(`${BASE}/:artifactDirId/name`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      RenameArtifactDirRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as RenameArtifactDirRequest;
  const name = body.name?.trim() ?? '';

  if (!name) {
    return c.json({ error: NAME_REQUIRED_MESSAGE }, 400);
  }

  try {
    const runningTerminal = terminalRegistry.getRunningTerminalForArtifact(
      projectId,
      artifactDirId
    );
    if (runningTerminal) {
      return c.json<TerminalConflictResponse>(
        {
          error: `Artifact directory "${artifactDirId}" has a running terminal and cannot be renamed`,
          terminal: toTerminalSummaryDto(runningTerminal),
        },
        409
      );
    }

    if (sessionRunRegistry.hasActiveRunForArtifact(projectId, artifactDirId)) {
      return c.json(
        {
          error: `Artifact directory "${artifactDirId}" has an active live run and cannot be renamed`,
        },
        409
      );
    }

    terminalRegistry.dropExitedTerminalsForArtifact(projectId, artifactDirId);
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const metadata = await dir.rename(name);
    const renamedDir = await ArtifactDir.getById(projectId, metadata.id);
    const renamedMetadata = await renamedDir.getMetadata();
    return c.json<ArtifactDirDto>(toArtifactDirDto(renamedMetadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to rename artifact directory';
    const status = classifyArtifactDirRenameErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/files — List artifact files */
artifactDirRoutes.get(`${BASE}/:artifactDirId/files`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const files = await dir.listArtifacts();
    return c.json<ArtifactFilesListResponse>(files);
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/skills — List installed artifact skills */
artifactDirRoutes.get(`${BASE}/:artifactDirId/skills`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const skills = await dir.getInstalledSkills();
    return c.json<ArtifactInstalledSkillDto[]>(
      skills.map((skill) => toArtifactInstalledSkillDto(skill))
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/explorer — List one directory level */
artifactDirRoutes.get(`${BASE}/:artifactDirId/explorer`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const queryValidation = validateSchema(
    c,
    ArtifactExplorerQuerySchema,
    c.req.query(),
    INVALID_QUERY_PARAMETERS_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const query = queryValidation.value as ArtifactExplorerQuery;
  const path = query.path ?? '';

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const listing = await dir.listArtifactEntries(path);
    return c.json<ArtifactExplorerResult>(listing);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list artifact explorer entries';
    const status = classifyExplorerErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/file?path=... — Read a file */
artifactDirRoutes.get(`${BASE}/:artifactDirId/file`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const queryValidation = validateSchema(
    c,
    ArtifactFileQuerySchema,
    c.req.query(),
    INVALID_QUERY_PARAMETERS_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const query = queryValidation.value as ArtifactFileQuery;
  const path = query.path;
  const maxBytesRaw = query.maxBytes;

  if (!path || !path.trim()) {
    return c.json({ error: PATH_QUERY_REQUIRED_MESSAGE }, 400);
  }

  let maxBytes = FILE_READ_DEFAULT_MAX_BYTES;
  if (maxBytesRaw !== undefined) {
    const parsed = Number(maxBytesRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return c.json({ error: 'maxBytes must be a positive number' }, 400);
    }
    maxBytes = Math.floor(parsed);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const file = await dir.readArtifactFile(path, maxBytes);
    return c.json<ArtifactFileDto>(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read artifact file';
    const status = classifyFileReadErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** PATCH /api/projects/:projectId/artifacts/:artifactDirId/file — Update a text file */
artifactDirRoutes.patch(`${BASE}/:artifactDirId/file`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      UpdateArtifactFileRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as UpdateArtifactFileRequest;
  const path = body.path?.trim() ?? '';
  const content = body.content;

  if (!path) {
    return c.json({ error: 'path is required' }, 400);
  }
  if (typeof content !== 'string') {
    return c.json({ error: 'content is required' }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const file = await dir.writeArtifactFile(path, content);
    return c.json<ArtifactFileDto>(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update artifact file';
    const status = classifyFileWriteErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/file/raw?path=... — Read raw file bytes */
artifactDirRoutes.get(`${BASE}/:artifactDirId/file/raw`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const queryValidation = validateSchema(
    c,
    ArtifactRawFileQuerySchema,
    c.req.query(),
    INVALID_QUERY_PARAMETERS_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const query = queryValidation.value as ArtifactRawFileQuery;
  const path = query.path;

  if (!path || !path.trim()) {
    return c.json({ error: PATH_QUERY_REQUIRED_MESSAGE }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const file = await dir.readArtifactRawFile(path);
    return new Response(new Uint8Array(file.content), {
      status: 200,
      headers: {
        'Content-Type': inferContentType(file.path),
        'Content-Length': `${file.size}`,
        'Cache-Control': 'no-store',
        'X-Artifact-Path': file.path,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read raw artifact file';
    const status = classifyFileReadErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** POST /api/projects/:projectId/artifacts/:artifactDirId/skills — Install a registered skill */
artifactDirRoutes.post(`${BASE}/:artifactDirId/skills`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      InstallArtifactSkillRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as InstallArtifactSkillRequest;
  const skillName = body.skillName?.trim() ?? '';

  if (!skillName) {
    return c.json({ error: SKILL_NAME_REQUIRED_MESSAGE }, 400);
  }

  const liveRunResponse = getLiveRunConflictResponse(c, projectId, artifactDirId, 'install skills');
  if (liveRunResponse) {
    return liveRunResponse;
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const skill = await dir.installSkill(skillName);
    return c.json<ArtifactInstalledSkillDto>(toArtifactInstalledSkillDto(skill));
  } catch (e) {
    const status = classifySkillErrorStatus(e);
    const message = e instanceof Error ? e.message : 'Failed to install skill';
    return c.json({ error: message }, status);
  }
});

/** POST /api/projects/:projectId/artifacts/:artifactDirId/skills/:skillName/reload — Reload a registered skill */
artifactDirRoutes.post(`${BASE}/:artifactDirId/skills/:skillName/reload`, async (c) => {
  const { projectId, artifactDirId, skillName: rawSkillName } = c.req.param();
  const skillName = rawSkillName?.trim() ?? '';

  if (!skillName) {
    return c.json({ error: SKILL_NAME_REQUIRED_MESSAGE }, 400);
  }

  const liveRunResponse = getLiveRunConflictResponse(c, projectId, artifactDirId, 'reload skills');
  if (liveRunResponse) {
    return liveRunResponse;
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const skill = await dir.reloadSkill(skillName);
    return c.json<ArtifactInstalledSkillDto>(toArtifactInstalledSkillDto(skill));
  } catch (e) {
    const status = classifySkillErrorStatus(e);
    const message = e instanceof Error ? e.message : 'Failed to reload skill';
    return c.json({ error: message }, status);
  }
});

/** PATCH /api/projects/:projectId/artifacts/:artifactDirId/path/rename — Rename a file or directory */
artifactDirRoutes.patch(`${BASE}/:artifactDirId/path/rename`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      RenameArtifactPathRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as RenameArtifactPathRequest;
  const path = body.path?.trim() ?? '';
  const newName = body.newName?.trim() ?? '';

  if (!path) {
    return c.json({ error: 'path is required' }, 400);
  }
  if (!newName) {
    return c.json({ error: 'newName is required' }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const result = await dir.renameArtifactPath(path, newName);
    return c.json<RenameArtifactPathResponse>({
      ok: true,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to rename artifact path';
    const status = classifyPathMutationErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** DELETE /api/projects/:projectId/artifacts/:artifactDirId/path?path=... — Delete a file or directory */
artifactDirRoutes.delete(`${BASE}/:artifactDirId/path`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const queryValidation = validateSchema(
    c,
    DeleteArtifactPathQuerySchema,
    c.req.query(),
    INVALID_QUERY_PARAMETERS_MESSAGE
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const query = queryValidation.value as DeleteArtifactPathQuery;
  const path = query.path?.trim();

  if (!path) {
    return c.json({ error: 'path query parameter is required' }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const result = await dir.deleteArtifactPath(path);
    return c.json<DeleteArtifactPathResponse>({
      ok: true,
      deleted: true,
      ...result,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete artifact path';
    const status = classifyPathMutationErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** DELETE /api/projects/:projectId/artifacts/:artifactDirId/skills/:skillName — Remove an installed registered skill */
artifactDirRoutes.delete(`${BASE}/:artifactDirId/skills/:skillName`, async (c) => {
  const { projectId, artifactDirId, skillName: rawSkillName } = c.req.param();
  const skillName = rawSkillName?.trim() ?? '';

  if (!skillName) {
    return c.json({ error: SKILL_NAME_REQUIRED_MESSAGE }, 400);
  }

  const liveRunResponse = getLiveRunConflictResponse(c, projectId, artifactDirId, 'delete skills');
  if (liveRunResponse) {
    return liveRunResponse;
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    await dir.deleteSkill(skillName);
    return c.json<DeleteArtifactSkillResponse>(toDeleteArtifactSkillResponse(skillName));
  } catch (e) {
    const status = classifySkillErrorStatus(e);
    const message = e instanceof Error ? e.message : 'Failed to delete skill';
    return c.json({ error: message }, status);
  }
});

/** DELETE /api/projects/:projectId/artifacts/:artifactDirId — Delete an artifact directory */
artifactDirRoutes.delete(`${BASE}/:artifactDirId`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const runningTerminal = terminalRegistry.getRunningTerminalForArtifact(
      projectId,
      artifactDirId
    );
    if (runningTerminal) {
      return c.json<TerminalConflictResponse>(
        {
          error: `Artifact directory "${artifactDirId}" has a running terminal and cannot be deleted`,
          terminal: toTerminalSummaryDto(runningTerminal),
        },
        409
      );
    }

    terminalRegistry.dropExitedTerminalsForArtifact(projectId, artifactDirId);
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    await dir.delete();
    return c.json<ArtifactDirDeleteResponse>({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

function classifyExplorerErrorStatus(message: string): 400 | 404 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes(NOT_FOUND_IN_PROJECT_FRAGMENT) ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (message === INVALID_PATH_MESSAGE || message.includes('not a directory')) {
    return 400;
  }
  return 500;
}

function classifyFileReadErrorStatus(message: string): 400 | 404 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes(NOT_FOUND_IN_PROJECT_FRAGMENT) ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (
    message === INVALID_PATH_MESSAGE ||
    message.includes('Path is required') ||
    message.includes('not a file')
  ) {
    return 400;
  }
  return 500;
}

function classifyFileWriteErrorStatus(message: string): 400 | 404 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes(NOT_FOUND_IN_PROJECT_FRAGMENT) ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (
    message === INVALID_PATH_MESSAGE ||
    message.includes('Path is required') ||
    message.includes('not a file')
  ) {
    return 400;
  }
  return 500;
}

function classifyPathMutationErrorStatus(message: string): 400 | 404 | 409 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes(NOT_FOUND_IN_PROJECT_FRAGMENT) ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (message.includes('already exists')) {
    return 409;
  }
  if (
    message === INVALID_PATH_MESSAGE ||
    message.includes('Path is required') ||
    message.includes('newName is required') ||
    message.includes('newName cannot contain path separators') ||
    message.includes('newName is invalid') ||
    message.includes('not a file or directory')
  ) {
    return 400;
  }
  return 500;
}

function classifyArtifactDirRenameErrorStatus(message: string): 404 | 409 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes(NOT_FOUND_IN_PROJECT_FRAGMENT) ||
    message.includes('not found')
  ) {
    return 404;
  }

  if (message.includes('already exists') || message.includes('active live run')) {
    return 409;
  }

  return 500;
}

function classifySkillErrorStatus(error: unknown): 400 | 404 | 409 | 500 | 502 {
  if (error instanceof UnknownArtifactSkillError) {
    return 400;
  }

  if (error instanceof ArtifactSkillNotInstalledError) {
    return 404;
  }

  if (error instanceof ArtifactSkillAlreadyInstalledError) {
    return 409;
  }

  if (error instanceof ArtifactSkillSourceError) {
    return 502;
  }

  const message = error instanceof Error ? error.message : '';
  if (
    message === NOT_FOUND_MSG ||
    message.includes(NOT_FOUND_IN_PROJECT_FRAGMENT) ||
    message.includes('not found')
  ) {
    return 404;
  }

  return 500;
}

function getLiveRunConflictResponse(
  c: { json: (body: unknown, status?: number) => Response },
  projectId: string,
  artifactDirId: string,
  action: string
): Response | null {
  if (!sessionRunRegistry.hasActiveRunForArtifact(projectId, artifactDirId)) {
    return null;
  }

  return c.json(
    {
      error: `Artifact directory "${artifactDirId}" has an active live run and cannot ${action}`,
    },
    409
  );
}

function inferContentType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'tsv':
      return 'text/tab-separated-values; charset=utf-8';
    case 'md':
      return 'text/markdown; charset=utf-8';
    case 'json':
      return 'application/json; charset=utf-8';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'txt':
    case 'log':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
