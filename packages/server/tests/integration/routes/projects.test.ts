import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ArtifactDirOverviewDtoSchema,
  ProjectDtoSchema,
  ProjectOverviewDtoSchema,
  SessionSummaryDtoSchema,
} from '@ank1015/llm-app-contracts';
import { Value } from '@sinclair/typebox/value';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setConfig } from '../../../src/core/config.js';
import { pathExists } from '../../../src/core/storage/fs.js';
import { resetAgentMocks } from '../../helpers/mock-agents.js';

const { app } = await import('../../../src/index.js');

let projectsRoot: string;
let dataRoot: string;

beforeEach(async () => {
  resetAgentMocks();
  projectsRoot = await mkdtemp(join(tmpdir(), 'test-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'test-data-'));
  setConfig({ projectsRoot, dataRoot });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

const legacySkillsDirName = ['max', '-skills'].join('');

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function get(path: string) {
  return app.request(path);
}

function del(path: string) {
  return app.request(path, { method: 'DELETE' });
}

describe('Project Routes', () => {
  describe('POST /api/projects', () => {
    it('should create a project and return 201', async () => {
      const res = await post('/api/projects', {
        name: 'My Project',
        description: 'A test',
        projectImg: 'https://example.com/project.png',
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(Value.Check(ProjectDtoSchema, body)).toBe(true);
      expect(body.id).toBe('my-project');
      expect(body.name).toBe('My Project');
      expect(body.description).toBe('A test');
      expect(body.projectImg).toBe('https://example.com/project.png');
      expect(body).not.toHaveProperty('projectPath');
      expect(body.createdAt).toBeDefined();
      expect(await pathExists(join(projectsRoot, 'my-project', '.max'))).toBe(false);
      expect(await pathExists(join(projectsRoot, 'my-project', legacySkillsDirName))).toBe(false);
    });

    it('should return 400 when name is missing', async () => {
      const res = await post('/api/projects', {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('name is required');
    });

    it('should return 409 when project already exists', async () => {
      await post('/api/projects', { name: 'Duplicate' });
      const res = await post('/api/projects', { name: 'Duplicate' });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });
  });

  describe('GET /api/projects', () => {
    it('should return empty array when no projects', async () => {
      const res = await get('/api/projects');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('should return all projects', async () => {
      await post('/api/projects', { name: 'Alpha', projectImg: 'https://example.com/alpha.png' });
      await post('/api/projects', { name: 'Beta' });

      const res = await get('/api/projects');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.every((project: unknown) => Value.Check(ProjectDtoSchema, project))).toBe(true);
      expect(body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'alpha',
            projectImg: 'https://example.com/alpha.png',
          }),
          expect.objectContaining({
            id: 'beta',
            projectImg: null,
          }),
        ])
      );
    });
  });

  describe('PATCH /api/projects/project-img', () => {
    it('should update projectImg using the project name', async () => {
      await post('/api/projects', { name: 'Image Project' });

      const res = await patch('/api/projects/project-img', {
        projectName: 'Image Project',
        projectImg: 'https://example.com/image-project.png',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Value.Check(ProjectDtoSchema, body)).toBe(true);
      expect(body.id).toBe('image-project');
      expect(body.projectImg).toBe('https://example.com/image-project.png');

      const listRes = await get('/api/projects');
      const projects = await listRes.json();
      expect(projects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'image-project',
            projectImg: 'https://example.com/image-project.png',
          }),
        ])
      );
    });

    it('should return 400 when projectId and projectName are both missing', async () => {
      const res = await patch('/api/projects/project-img', {
        projectImg: 'https://example.com/project.png',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('projectId or projectName is required');
    });

    it('should return 400 when projectImg is missing', async () => {
      const res = await patch('/api/projects/project-img', {
        projectName: 'Image Project',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('projectImg is required');
    });

    it('should return 404 when the project does not exist', async () => {
      const res = await patch('/api/projects/project-img', {
        projectName: 'Missing Project',
        projectImg: 'https://example.com/project.png',
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /api/projects/:projectId', () => {
    it('should return project metadata', async () => {
      await post('/api/projects', { name: 'Fetch Me' });

      const res = await get('/api/projects/fetch-me');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Value.Check(ProjectDtoSchema, body)).toBe(true);
      expect(body.id).toBe('fetch-me');
      expect(body.name).toBe('Fetch Me');
      expect(body).not.toHaveProperty('projectPath');
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await get('/api/projects/nonexistent');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });
  });

  describe('GET /api/projects/:projectId/file-index', () => {
    it('should return files and directories across all artifacts', async () => {
      await post('/api/projects', { name: 'Index Project' });
      await post('/api/projects/index-project/artifacts', {
        name: 'docs',
      });
      await post('/api/projects/index-project/artifacts', {
        name: 'code',
      });

      await writeFile(join(projectsRoot, 'index-project', 'docs', 'README.md'), '# Docs');
      await mkdir(join(projectsRoot, 'index-project', 'code', 'src'), { recursive: true });
      await writeFile(join(projectsRoot, 'index-project', 'code', 'src', 'index.ts'), 'export {};');

      const res = await get('/api/projects/index-project/file-index');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.projectId).toBe('index-project');
      expect(body.truncated).toBe(false);
      expect(body.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'docs',
            path: 'README.md',
            type: 'file',
            artifactPath: 'docs/README.md',
          }),
          expect.objectContaining({
            artifactId: 'code',
            path: 'src',
            type: 'directory',
            artifactPath: 'code/src/',
          }),
          expect.objectContaining({
            artifactId: 'code',
            path: 'src/index.ts',
            type: 'file',
            artifactPath: 'code/src/index.ts',
          }),
        ])
      );
    });

    it('should ignore common junk paths, respect .gitignore files, and include artifact roots', async () => {
      await post('/api/projects', { name: 'Ignore Project' });
      await post('/api/projects/ignore-project/artifacts', {
        name: 'Workspace',
      });

      const base = join(projectsRoot, 'ignore-project', 'workspace');
      await mkdir(join(base, 'src'), { recursive: true });
      await mkdir(join(base, 'node_modules', 'pkg'), { recursive: true });
      await mkdir(join(base, '.max'), { recursive: true });
      await mkdir(join(base, 'dist'), { recursive: true });

      await writeFile(join(base, '.gitignore'), ['ignored.txt', 'src/secret.txt'].join('\n'));
      await writeFile(join(base, 'README.md'), '# Docs');
      await writeFile(join(base, 'ignored.txt'), 'ignore me');
      await writeFile(join(base, 'src', 'index.ts'), 'export {};');
      await writeFile(join(base, 'src', 'secret.txt'), 'top secret');
      await writeFile(join(base, 'node_modules', 'pkg', 'index.js'), 'module.exports = {};');
      await writeFile(join(base, '.max', 'state.json'), '{}');
      await writeFile(join(base, 'dist', 'bundle.js'), 'console.log("hi");');
      await writeFile(join(base, '.DS_Store'), '');

      const res = await get('/api/projects/ignore-project/file-index');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactId: 'workspace',
            path: '',
            type: 'directory',
            artifactPath: 'workspace/',
          }),
          expect.objectContaining({
            artifactId: 'workspace',
            path: 'README.md',
            type: 'file',
            artifactPath: 'workspace/README.md',
          }),
          expect.objectContaining({
            artifactId: 'workspace',
            path: 'src/index.ts',
            type: 'file',
            artifactPath: 'workspace/src/index.ts',
          }),
        ])
      );
      expect(body.files).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'ignored.txt' }),
          expect.objectContaining({ path: 'src/secret.txt' }),
          expect.objectContaining({ path: 'node_modules' }),
          expect.objectContaining({ path: 'node_modules/pkg/index.js' }),
          expect.objectContaining({ path: '.max' }),
          expect.objectContaining({ path: '.max/state.json' }),
          expect.objectContaining({ path: 'dist' }),
          expect.objectContaining({ path: 'dist/bundle.js' }),
          expect.objectContaining({ path: '.DS_Store' }),
        ])
      );
    });

    it('should filter files by query', async () => {
      await post('/api/projects', { name: 'Filter Project' });
      await post('/api/projects/filter-project/artifacts', {
        name: 'work',
      });

      await writeFile(join(projectsRoot, 'filter-project', 'work', 'README.md'), '# Docs');
      await writeFile(join(projectsRoot, 'filter-project', 'work', 'notes.txt'), 'notes');

      const res = await get('/api/projects/filter-project/file-index?query=readme');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.files).toHaveLength(1);
      expect(body.files[0].path).toBe('README.md');
      expect(body.files[0].type).toBe('file');
    });

    it('should match artifact roots when querying by artifact name with a trailing slash', async () => {
      await post('/api/projects', { name: 'Artifact Root Project' });
      await post('/api/projects/artifact-root-project/artifacts', {
        name: 'Server',
      });

      const base = join(projectsRoot, 'artifact-root-project', 'server');
      await mkdir(join(base, 'src'), { recursive: true });
      await writeFile(join(base, 'src', 'index.ts'), 'export {};');

      const res = await get('/api/projects/artifact-root-project/file-index?query=server%2F');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.files).toEqual([
        expect.objectContaining({
          artifactId: 'server',
          artifactName: 'Server',
          path: '',
          type: 'directory',
          artifactPath: 'server/',
        }),
      ]);
    });

    it('should respect limit and set truncated', async () => {
      await post('/api/projects', { name: 'Limit Project' });
      await post('/api/projects/limit-project/artifacts', {
        name: 'bucket',
      });

      const base = join(projectsRoot, 'limit-project', 'bucket');
      await writeFile(join(base, 'a.txt'), 'a');
      await writeFile(join(base, 'b.txt'), 'b');
      await writeFile(join(base, 'c.txt'), 'c');

      const res = await get('/api/projects/limit-project/file-index?limit=2');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.files).toHaveLength(2);
      expect(body.truncated).toBe(true);
    });

    it('should return 400 for invalid limit', async () => {
      await post('/api/projects', { name: 'Bad Limit Project' });

      const res = await get('/api/projects/bad-limit-project/file-index?limit=0');
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('limit must be a positive number');
    });

    it('should return 404 for missing projects', async () => {
      const res = await get('/api/projects/missing/file-index');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/projects/:projectId/overview', () => {
    it('returns cleaned overview DTOs without leaked session internals', async () => {
      await post('/api/projects', { name: 'Overview Project' });
      await post('/api/projects/overview-project/artifacts', { name: 'research' });

      const createSessionRes = await app.request(
        '/api/projects/overview-project/artifacts/research/sessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Overview Session',
            api: 'anthropic',
            modelId: 'claude-sonnet-4-5',
          }),
        }
      );
      expect(createSessionRes.status).toBe(201);

      const res = await get('/api/projects/overview-project/overview');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Value.Check(ProjectOverviewDtoSchema, body)).toBe(true);
      expect(Value.Check(ProjectDtoSchema, body.project)).toBe(true);
      expect(body.project).not.toHaveProperty('projectPath');
      expect(body.artifactDirs).toHaveLength(1);
      expect(Value.Check(ArtifactDirOverviewDtoSchema, body.artifactDirs[0])).toBe(true);
      expect(Value.Check(SessionSummaryDtoSchema, body.artifactDirs[0].sessions[0])).toBe(true);
      expect(body.artifactDirs[0].sessions[0]).not.toHaveProperty('filePath');
      expect(body.artifactDirs[0].sessions[0]).not.toHaveProperty('branches');
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('should delete project and return success', async () => {
      await post('/api/projects', { name: 'Delete Me' });

      const res = await del('/api/projects/delete-me');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      // Verify it's gone
      const getRes = await get('/api/projects/delete-me');
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await del('/api/projects/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
