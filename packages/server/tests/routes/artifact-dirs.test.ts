import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setConfig } from '../../src/core/config.js';
import { app } from '../../src/index.js';

let projectsRoot: string;
let dataRoot: string;

const PROJECT = 'test-project';
const BASE = `/api/projects/${PROJECT}/artifacts`;

beforeEach(async () => {
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
