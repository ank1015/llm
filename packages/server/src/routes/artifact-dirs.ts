import { Hono } from 'hono';

import { ArtifactDir, ARTIFACT_TYPES } from '../core/index.js';

import type { ArtifactType } from '../core/index.js';

const BASE = '/projects/:projectId/artifacts';
const NOT_FOUND_MSG = 'Artifact directory not found';

export const artifactDirRoutes = new Hono();

/** POST /api/projects/:projectId/artifacts — Create a new artifact directory */
artifactDirRoutes.post(BASE, async (c) => {
  const { projectId } = c.req.param();
  const body = await c.req.json<{ name: string; description?: string; type?: string }>();

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  if (body.type && !ARTIFACT_TYPES.includes(body.type as ArtifactType)) {
    return c.json(
      {
        error: `Invalid artifact type "${body.type}". Must be one of: ${ARTIFACT_TYPES.join(', ')}`,
      },
      400
    );
  }

  try {
    const input = { name: body.name } as {
      name: string;
      description?: string;
      type?: ArtifactType;
    };
    if (body.description) input.description = body.description;
    if (body.type) input.type = body.type as ArtifactType;
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
