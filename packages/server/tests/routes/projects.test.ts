import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setConfig } from '../../src/core/config.js';
import { app } from '../../src/index.js';

let projectsRoot: string;
let dataRoot: string;

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'test-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'test-data-'));
  setConfig({ projectsRoot, dataRoot });
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

describe('Project Routes', () => {
  describe('POST /api/projects', () => {
    it('should create a project and return 201', async () => {
      const res = await post('/api/projects', { name: 'My Project', description: 'A test' });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.id).toBe('my-project');
      expect(body.name).toBe('My Project');
      expect(body.description).toBe('A test');
      expect(body.projectPath).toBeDefined();
      expect(body.createdAt).toBeDefined();
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
      await post('/api/projects', { name: 'Alpha' });
      await post('/api/projects', { name: 'Beta' });

      const res = await get('/api/projects');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /api/projects/:projectId', () => {
    it('should return project metadata', async () => {
      await post('/api/projects', { name: 'Fetch Me' });

      const res = await get('/api/projects/fetch-me');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('fetch-me');
      expect(body.name).toBe('Fetch Me');
    });

    it('should return 404 for nonexistent project', async () => {
      const res = await get('/api/projects/nonexistent');

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
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
