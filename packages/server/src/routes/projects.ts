import {
  CreateProjectRequestSchema,
  ProjectFileIndexQuerySchema,
  RenameProjectRequestSchema,
  UpdateProjectImageRequestSchema,
} from '../contracts/index.js';
import { Hono } from 'hono';

import { ArtifactDir, Project, Session } from '../core/index.js';
import { terminalRegistry } from '../core/terminal/terminal-registry.js';
import { toArtifactDirOverviewDto, toProjectDto, toTerminalSummaryDto } from '../http/contracts.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  CreateProjectRequest,
  ProjectDeleteResponse,
  ProjectDto,
  ProjectFileIndexQuery,
  ProjectFileIndexResult,
  ProjectOverviewDto,
  RenameProjectRequest,
  TerminalConflictResponse,
  UpdateProjectImageRequest,
} from '../contracts/index.js';
import type { ProjectFileIndexEntry } from '../types/index.js';

export const projectRoutes = new Hono();
const DEFAULT_FILE_INDEX_LIMIT = 2000;
const MAX_FILE_INDEX_LIMIT = 10000;
const PROJECT_NOT_FOUND_MESSAGE = 'Project not found';
const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';
const NAME_REQUIRED_MESSAGE = 'name is required';

/** POST /api/projects — Create a new project */
projectRoutes.post('/projects', async (c) => {
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      CreateProjectRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as CreateProjectRequest;
  const name = body.name?.trim() ?? '';

  if (!name) {
    return c.json({ error: NAME_REQUIRED_MESSAGE }, 400);
  }

  try {
    const project = await Project.create({
      name,
      ...(body.description?.trim() ? { description: body.description.trim() } : {}),
      ...(body.projectImg?.trim() ? { projectImg: body.projectImg.trim() } : {}),
    });
    const metadata = await project.getMetadata();
    return c.json<ProjectDto>(toProjectDto(metadata), 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create project';
    return c.json({ error: message }, message.includes('already exists') ? 409 : 500);
  }
});

/** GET /api/projects — List all projects */
projectRoutes.get('/projects', async (c) => {
  const projects = await Project.list();
  return c.json<ProjectDto[]>(projects.map(toProjectDto));
});

/** PATCH /api/projects/project-img — Set a project's image URL using the project id or project name */
projectRoutes.patch('/projects/project-img', async (c) => {
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      UpdateProjectImageRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as UpdateProjectImageRequest;
  const projectId = body.projectId?.trim() ?? '';
  const projectName = body.projectName?.trim() ?? '';
  const projectImg = body.projectImg?.trim() ?? '';

  if (!projectId && !projectName) {
    return c.json({ error: 'projectId or projectName is required' }, 400);
  }

  if (!projectImg) {
    return c.json({ error: 'projectImg is required' }, 400);
  }

  try {
    const project = projectId
      ? await Project.getById(projectId)
      : await Project.getByName(projectName);
    const metadata = await project.updateProjectImg(projectImg);
    return c.json<ProjectDto>(toProjectDto(metadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update project image';
    return c.json({ error: message }, message.includes('not found') ? 404 : 500);
  }
});

/** PATCH /api/projects/:projectId/archive-toggle — Toggle a project's archived state */
projectRoutes.patch('/projects/:projectId/archive-toggle', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    const metadata = await project.toggleArchived();
    return c.json<ProjectDto>(toProjectDto(metadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to toggle project archive state';
    return c.json({ error: message }, message.includes('not found') ? 404 : 500);
  }
});

/** GET /api/projects/:projectId — Get a single project */
projectRoutes.get('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    const metadata = await project.getMetadata();
    return c.json<ProjectDto>(toProjectDto(metadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : PROJECT_NOT_FOUND_MESSAGE;
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
        return toArtifactDirOverviewDto(dir, sessions);
      })
    );

    return c.json<ProjectOverviewDto>({
      project: toProjectDto(projectMeta),
      artifactDirs,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : PROJECT_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/projects/:projectId/file-index — Search files and directories across all artifact directories */
projectRoutes.get('/projects/:projectId/file-index', async (c) => {
  const { projectId } = c.req.param();
  const queryValidation = validateSchema(
    c,
    ProjectFileIndexQuerySchema,
    c.req.query(),
    'Invalid query parameters'
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const queryParams = queryValidation.value as ProjectFileIndexQuery;
  const query = (queryParams.query ?? '').trim();
  const limitParam = queryParams.limit;

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
        includeRoot: shouldIncludeArtifactRoot(query, artifact),
      });

      files.push(
        ...indexed.files.map((file) => ({
          artifactId: artifact.id,
          artifactName: artifact.name,
          path: file.path,
          type: file.type,
          artifactPath: buildArtifactPath(artifact.id, file.path, file.type),
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

    return c.json<ProjectFileIndexResult>({
      projectId,
      query,
      files,
      truncated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : PROJECT_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

function shouldIncludeArtifactRoot(query: string, artifact: { id: string; name: string }): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const candidates = [
    artifact.id.toLowerCase(),
    `${artifact.id.toLowerCase()}/`,
    artifact.name.toLowerCase(),
    `${artifact.name.toLowerCase()}/`,
  ];

  return candidates.some((candidate) => candidate.includes(normalizedQuery));
}

function buildArtifactPath(
  artifactId: string,
  path: string,
  type: ProjectFileIndexEntry['type']
): string {
  if (!path) {
    return `${artifactId}/`;
  }

  return `${artifactId}/${path}${type === 'directory' ? '/' : ''}`;
}

/** PATCH /api/projects/:projectId/name — Rename a project without changing its stable id */
projectRoutes.patch('/projects/:projectId/name', async (c) => {
  const { projectId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      RenameProjectRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as RenameProjectRequest;
  const name = body.name?.trim() ?? '';

  if (!name) {
    return c.json({ error: NAME_REQUIRED_MESSAGE }, 400);
  }

  try {
    const project = await Project.getById(projectId);
    const metadata = await project.rename(name);
    return c.json<ProjectDto>(toProjectDto(metadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to rename project';
    return c.json({ error: message }, message.includes('not found') ? 404 : 500);
  }
});

/** DELETE /api/projects/:projectId — Delete a project */
projectRoutes.delete('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();

  try {
    const runningTerminal = terminalRegistry.getRunningTerminalForProject(projectId);
    if (runningTerminal) {
      return c.json<TerminalConflictResponse>(
        {
          error: `Project "${projectId}" has a running terminal and cannot be deleted`,
          terminal: toTerminalSummaryDto(runningTerminal),
        },
        409
      );
    }

    terminalRegistry.dropExitedTerminalsForProject(projectId);
    const project = await Project.getById(projectId);
    await project.delete();
    return c.json<ProjectDeleteResponse>({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : PROJECT_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});
