import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setConfig } from '../../src/core/config.js';
import { mockAddSkill, mockListInstalledSkills, resetAgentMocks } from '../helpers/mock-agents.js';

const { app } = await import('../../src/index.js');

let projectsRoot: string;
let dataRoot: string;

const PROJECT = 'test-project';
const BASE = `/api/projects/${PROJECT}/artifacts`;

beforeEach(async () => {
  resetAgentMocks();
  projectsRoot = await mkdtemp(join(tmpdir(), 'test-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'test-data-'));
  setConfig({ projectsRoot, dataRoot });

  // Create a project first
  await app.request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PROJECT }),
  });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
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

describe('Artifact Dir Routes', () => {
  describe('POST /api/projects/:projectId/artifacts', () => {
    it('should create an artifact directory and return 201', async () => {
      const res = await post(BASE, { name: 'Research', description: 'Findings' });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('research');
      expect(body.name).toBe('Research');
      expect(body.description).toBe('Findings');
      expect(body.createdAt).toBeDefined();
    });

    it('should return 400 when name is missing', async () => {
      const res = await post(BASE, {});

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('name is required');
    });

    it('should return 409 when artifact dir already exists', async () => {
      await post(BASE, { name: 'dup' });
      const res = await post(BASE, { name: 'dup' });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });
  });

  describe('GET /api/projects/:projectId/artifacts', () => {
    it('should return empty array when no artifact dirs', async () => {
      const res = await get(BASE);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('should return all artifact directories', async () => {
      await post(BASE, { name: 'research' });
      await post(BASE, { name: 'code' });

      const res = await get(BASE);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /api/projects/:projectId/artifacts/:artifactDirId', () => {
    it('should return artifact dir metadata', async () => {
      await post(BASE, { name: 'Findings' });

      const res = await get(`${BASE}/findings`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('findings');
      expect(body.name).toBe('Findings');
    });

    it('should return 404 for nonexistent artifact dir', async () => {
      const res = await get(`${BASE}/nonexistent`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/projects/:projectId/artifacts/:artifactDirId/files', () => {
    it('should return empty array for empty directory', async () => {
      await post(BASE, { name: 'empty' });

      const res = await get(`${BASE}/empty/files`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('should list files in the artifact directory', async () => {
      await post(BASE, { name: 'with-files' });

      // Write files directly to the working directory
      const dirPath = join(projectsRoot, PROJECT, 'with-files');
      await writeFile(join(dirPath, 'report.md'), '# Report');
      await writeFile(join(dirPath, 'data.json'), '{}');

      const res = await get(`${BASE}/with-files/files`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sort()).toEqual(['data.json', 'report.md']);
    });

    it('should return 404 for nonexistent artifact dir', async () => {
      const res = await get(`${BASE}/nonexistent/files`);

      expect(res.status).toBe(404);
    });
  });

  describe('artifact skill routes', () => {
    it('should return an empty installed skill list for a new artifact', async () => {
      await post(BASE, { name: 'skills' });

      const res = await get(`${BASE}/skills/skills`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
      expect(mockListInstalledSkills).toHaveBeenCalledWith(join(projectsRoot, PROJECT, 'skills'));
    });

    it('should return installed skills for an artifact', async () => {
      await post(BASE, { name: 'skills' });
      mockListInstalledSkills.mockResolvedValueOnce([
        {
          name: 'browser-use',
          description: 'Browser automation and site-specific helpers.',
          path: join(projectsRoot, PROJECT, 'skills', '.max', 'skills', 'browser-use', 'SKILL.md'),
          artifactDir: join(projectsRoot, PROJECT, 'skills'),
          maxDir: join(projectsRoot, PROJECT, 'skills', '.max'),
          skillsDir: join(projectsRoot, PROJECT, 'skills', '.max', 'skills'),
          tempDir: join(projectsRoot, PROJECT, 'skills', '.max', 'temp'),
          directory: join(projectsRoot, PROJECT, 'skills', '.max', 'skills', 'browser-use'),
        },
      ]);

      const res = await get(`${BASE}/skills/skills`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('browser-use');
    });

    it('should install a bundled skill into an artifact and return the installed metadata', async () => {
      await post(BASE, { name: 'skills' });

      const res = await post(`${BASE}/skills/skills`, { skillName: 'browser-use' });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('browser-use');
      expect(body.path).toBe(
        join(projectsRoot, PROJECT, 'skills', '.max', 'skills', 'browser-use', 'SKILL.md')
      );
      expect(mockAddSkill).toHaveBeenCalledWith(
        'browser-use',
        join(projectsRoot, PROJECT, 'skills')
      );
    });

    it('should allow reinstalling the same skill', async () => {
      await post(BASE, { name: 'skills' });

      const first = await post(`${BASE}/skills/skills`, { skillName: 'browser-use' });
      const second = await post(`${BASE}/skills/skills`, { skillName: 'browser-use' });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(mockAddSkill).toHaveBeenCalledTimes(2);
    });

    it('should return 400 when skillName is missing', async () => {
      await post(BASE, { name: 'skills' });

      const res = await post(`${BASE}/skills/skills`, {});

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'skillName is required' });
    });

    it('should return 400 when the skill is unknown', async () => {
      await post(BASE, { name: 'skills' });
      mockAddSkill.mockRejectedValueOnce(
        new Error('Unknown bundled skill "bad-skill". Available skills: browser-use, llm-use')
      );

      const res = await post(`${BASE}/skills/skills`, { skillName: 'bad-skill' });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Unknown bundled skill');
    });

    it('should return 404 when installing into a missing artifact', async () => {
      const res = await post(`${BASE}/missing/skills`, { skillName: 'browser-use' });

      expect(res.status).toBe(404);
    });

    it('should return 404 when listing skills for a missing artifact', async () => {
      const res = await get(`${BASE}/missing/skills`);

      expect(res.status).toBe(404);
    });

    it('should return 404 when installing into a missing project', async () => {
      const res = await post('/api/projects/missing-project/artifacts/skills/skills', {
        skillName: 'browser-use',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/projects/:projectId/artifacts/:artifactDirId/explorer', () => {
    it('should list root directory entries with directories first', async () => {
      await post(BASE, { name: 'tree' });

      const dirPath = join(projectsRoot, PROJECT, 'tree');
      await mkdir(join(dirPath, 'src', 'utils'), { recursive: true });
      await writeFile(join(dirPath, 'README.md'), '# Hello');
      await writeFile(join(dirPath, 'src', 'index.ts'), 'export const x = 1;');

      const res = await get(`${BASE}/tree/explorer`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.path).toBe('');
      expect(body.entries.map((entry: { path: string }) => entry.path)).toEqual([
        'src',
        'README.md',
      ]);
      expect(body.entries[0].type).toBe('directory');
      expect(body.entries[1].type).toBe('file');
    });

    it('should list nested directory entries when path is provided', async () => {
      await post(BASE, { name: 'tree' });

      const dirPath = join(projectsRoot, PROJECT, 'tree');
      await mkdir(join(dirPath, 'src', 'utils'), { recursive: true });
      await writeFile(join(dirPath, 'src', 'index.ts'), 'export const x = 1;');
      await writeFile(
        join(dirPath, 'src', 'utils', 'math.ts'),
        'export const add = (a: number, b: number) => a + b;'
      );

      const res = await get(`${BASE}/tree/explorer?path=${encodeURIComponent('src')}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.path).toBe('src');
      expect(body.entries.map((entry: { path: string }) => entry.path)).toEqual([
        'src/utils',
        'src/index.ts',
      ]);
    });

    it('should return 400 for invalid traversal path', async () => {
      await post(BASE, { name: 'tree' });

      const res = await get(`${BASE}/tree/explorer?path=${encodeURIComponent('../secrets')}`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid path');
    });
  });

  describe('GET /api/projects/:projectId/artifacts/:artifactDirId/file', () => {
    it('should return file content for text files', async () => {
      await post(BASE, { name: 'reader' });

      const dirPath = join(projectsRoot, PROJECT, 'reader');
      await mkdir(join(dirPath, 'src'), { recursive: true });
      await writeFile(join(dirPath, 'src', 'index.ts'), 'export const value = 42;\n');

      const res = await get(`${BASE}/reader/file?path=${encodeURIComponent('src/index.ts')}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.path).toBe('src/index.ts');
      expect(body.content).toContain('value = 42');
      expect(body.isBinary).toBe(false);
      expect(body.truncated).toBe(false);
    });

    it('should mark binary files as binary', async () => {
      await post(BASE, { name: 'reader' });

      const dirPath = join(projectsRoot, PROJECT, 'reader');
      await writeFile(join(dirPath, 'image.bin'), Buffer.from([0, 1, 2, 3]));

      const res = await get(`${BASE}/reader/file?path=${encodeURIComponent('image.bin')}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.isBinary).toBe(true);
      expect(body.content).toBe('');
    });

    it('should return 400 when path query parameter is missing', async () => {
      await post(BASE, { name: 'reader' });

      const res = await get(`${BASE}/reader/file`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'path query parameter is required' });
    });

    it('should return 400 for invalid traversal path', async () => {
      await post(BASE, { name: 'reader' });

      const res = await get(`${BASE}/reader/file?path=${encodeURIComponent('../secret.txt')}`);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid path');
    });

    it('should return 404 for missing file paths', async () => {
      await post(BASE, { name: 'reader' });

      const res = await get(`${BASE}/reader/file?path=${encodeURIComponent('missing.txt')}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:projectId/artifacts/:artifactDirId', () => {
    it('should delete artifact dir and return success', async () => {
      await post(BASE, { name: 'remove-me' });

      const res = await del(`${BASE}/remove-me`);

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ deleted: true });

      // Verify it's gone
      const getRes = await get(`${BASE}/remove-me`);
      expect(getRes.status).toBe(404);
    });

    it('should return 404 for nonexistent artifact dir', async () => {
      const res = await del(`${BASE}/nonexistent`);

      expect(res.status).toBe(404);
    });
  });
});
