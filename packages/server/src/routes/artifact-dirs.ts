import { Hono } from 'hono';

import { ArtifactDir } from '../core/index.js';

const BASE = '/projects/:projectId/artifacts';
const NOT_FOUND_MSG = 'Artifact directory not found';
const FILE_READ_DEFAULT_MAX_BYTES = 200_000;

export const artifactDirRoutes = new Hono();

/** POST /api/projects/:projectId/artifacts — Create a new artifact directory */
artifactDirRoutes.post(BASE, async (c) => {
  const { projectId } = c.req.param();
  const body = await c.req.json<{ name: string; description?: string }>();

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  try {
    const input = { name: body.name } as { name: string; description?: string };
    if (body.description) input.description = body.description;
    const dir = await ArtifactDir.create(projectId, input);
    const metadata = await dir.getMetadata();
    return c.json(metadata, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create artifact directory';
    return c.json({ error: message }, 409);
  }
});

/** GET /api/projects/:projectId/artifacts — List artifact directories */
artifactDirRoutes.get(BASE, async (c) => {
  const { projectId } = c.req.param();
  const dirs = await ArtifactDir.list(projectId);
  return c.json(dirs);
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId — Get a single artifact directory */
artifactDirRoutes.get(`${BASE}/:artifactDirId`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const metadata = await dir.getMetadata();
    return c.json(metadata);
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/files — List artifact files */
artifactDirRoutes.get(`${BASE}/:artifactDirId/files`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const files = await dir.listArtifacts();
    return c.json(files);
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
    const skills = await dir.listInstalledSkills();
    return c.json(skills);
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/explorer — List one directory level */
artifactDirRoutes.get(`${BASE}/:artifactDirId/explorer`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const path = c.req.query('path') ?? '';

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const listing = await dir.listArtifactEntries(path);
    return c.json(listing);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list artifact explorer entries';
    const status = classifyExplorerErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/file?path=... — Read a file */
artifactDirRoutes.get(`${BASE}/:artifactDirId/file`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const path = c.req.query('path');
  const maxBytesRaw = c.req.query('maxBytes');

  if (!path || !path.trim()) {
    return c.json({ error: 'path query parameter is required' }, 400);
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
    return c.json(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read artifact file';
    const status = classifyFileReadErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** GET /api/projects/:projectId/artifacts/:artifactDirId/file/raw?path=... — Read raw file bytes */
artifactDirRoutes.get(`${BASE}/:artifactDirId/file/raw`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const path = c.req.query('path');

  if (!path || !path.trim()) {
    return c.json({ error: 'path query parameter is required' }, 400);
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

/** POST /api/projects/:projectId/artifacts/:artifactDirId/skills — Install a bundled skill */
artifactDirRoutes.post(`${BASE}/:artifactDirId/skills`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const body = await c.req.json<{ skillName?: string }>().catch(() => undefined);
  const skillName = body?.skillName?.trim() ?? '';

  if (!skillName) {
    return c.json({ error: 'skillName is required' }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const skill = await dir.installSkill(skillName);
    return c.json(skill);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to install skill';
    const status = classifySkillErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** DELETE /api/projects/:projectId/artifacts/:artifactDirId/skills/:skillName — Remove an installed skill */
artifactDirRoutes.delete(`${BASE}/:artifactDirId/skills/:skillName`, async (c) => {
  const { projectId, artifactDirId, skillName: rawSkillName } = c.req.param();
  const skillName = rawSkillName?.trim() ?? '';

  if (!skillName) {
    return c.json({ error: 'skillName is required' }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const result = await dir.deleteSkill(skillName);
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete skill';
    const status = classifySkillErrorStatus(message);
    return c.json({ error: message }, status);
  }
});

/** PATCH /api/projects/:projectId/artifacts/:artifactDirId/path/rename — Rename a file or directory */
artifactDirRoutes.patch(`${BASE}/:artifactDirId/path/rename`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const body = await c.req.json<{ path?: string; newName?: string }>();
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
    return c.json({
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
  const path = c.req.query('path')?.trim();

  if (!path) {
    return c.json({ error: 'path query parameter is required' }, 400);
  }

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    const result = await dir.deleteArtifactPath(path);
    return c.json({
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

/** DELETE /api/projects/:projectId/artifacts/:artifactDirId — Delete an artifact directory */
artifactDirRoutes.delete(`${BASE}/:artifactDirId`, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const dir = await ArtifactDir.getById(projectId, artifactDirId);
    await dir.delete();
    return c.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : NOT_FOUND_MSG;
    return c.json({ error: message }, 404);
  }
});

function classifyExplorerErrorStatus(message: string): 400 | 404 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes('not found in project') ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (message === 'Invalid path' || message.includes('not a directory')) {
    return 400;
  }
  return 500;
}

function classifyFileReadErrorStatus(message: string): 400 | 404 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes('not found in project') ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (
    message === 'Invalid path' ||
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
    message.includes('not found in project') ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (message.includes('already exists')) {
    return 409;
  }
  if (
    message === 'Invalid path' ||
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

function classifySkillErrorStatus(message: string): 400 | 404 | 500 {
  if (
    message === NOT_FOUND_MSG ||
    message.includes('not found in project') ||
    message.includes('not found')
  ) {
    return 404;
  }
  if (message === 'skillName is required' || message.startsWith('Unknown bundled skill')) {
    return 400;
  }
  return 500;
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
