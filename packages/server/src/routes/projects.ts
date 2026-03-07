import { Hono } from 'hono';

import { ArtifactDir, Project, Session } from '../core/index.js';

import type { ProjectFileIndexEntry } from '../core/index.js';

export const projectRoutes = new Hono();
const DEFAULT_FILE_INDEX_LIMIT = 2000;
const MAX_FILE_INDEX_LIMIT = 10000;

/** POST /api/projects — Create a new project */
projectRoutes.post('/projects', async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  try {
    const project = await Project.create(body);
    const metadata = await project.getMetadata();
    return c.json(metadata, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create project';
    return c.json({ error: message }, message.includes('already exists') ? 409 : 500);
  }
});

/** GET /api/projects — List all projects */
projectRoutes.get('/projects', async (c) => {
  const projects = await Project.list();
  return c.json(projects);
});

/** GET /api/projects/:projectId — Get a single project */
projectRoutes.get('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    const metadata = await project.getMetadata();
    return c.json(metadata);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Project not found';
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/overview — Get project with all artifact dirs and their sessions */
projectRoutes.get('/projects/:projectId/overview', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    const projectMeta = await project.getMetadata();
    const dirs = await ArtifactDir.list(projectId);

    const artifactDirs = await Promise.all(
      dirs.map(async (dir) => {
        const sessions = await Session.list(projectId, dir.id).catch(() => []);
        return { ...dir, sessions };
      })
    );

    return c.json({ project: projectMeta, artifactDirs });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Project not found';
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/file-index — Search files across all artifact directories */
projectRoutes.get('/projects/:projectId/file-index', async (c) => {
  const { projectId } = c.req.param();
  const query = (c.req.query('query') ?? '').trim();
  const limitParam = c.req.query('limit');

  let limit = DEFAULT_FILE_INDEX_LIMIT;
  if (limitParam !== undefined) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return c.json({ error: 'limit must be a positive number' }, 400);
    }
    limit = Math.min(Math.floor(parsed), MAX_FILE_INDEX_LIMIT);
  }

  try {
    await Project.getById(projectId);
    const artifactDirs = await ArtifactDir.list(projectId);
    const files: ProjectFileIndexEntry[] = [];
    let truncated = false;

    for (const artifact of artifactDirs) {
      if (files.length >= limit) {
        truncated = true;
        break;
      }

      const artifactDir = await ArtifactDir.getById(projectId, artifact.id);
      const remaining = limit - files.length;
      const indexed = await artifactDir.buildFileIndex({
        query,
        limit: remaining,
      });

      files.push(
        ...indexed.files.map((file) => ({
          artifactId: artifact.id,
          artifactName: artifact.name,
          path: file.path,
          artifactPath: `${artifact.id}/${file.path}`,
          size: file.size,
          updatedAt: file.updatedAt,
        }))
      );

      if (indexed.truncated) {
        truncated = true;
        break;
      }
    }

    files.sort((a, b) => {
      const artifactCompare = a.artifactId.localeCompare(b.artifactId);
      if (artifactCompare !== 0) {
        return artifactCompare;
      }
      return a.path.localeCompare(b.path);
    });

    return c.json({
      projectId,
      query,
      files,
      truncated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Project not found';
    return c.json({ error: message }, 404);
  }
});

/** DELETE /api/projects/:projectId — Delete a project */
projectRoutes.delete('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    await project.delete();
    return c.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Project not found';
    return c.json({ error: message }, 404);
  }
});
