import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setConfig } from '../src/core/config.js';
import { pathExists, readMetadata } from '../src/core/storage/fs.js';

import { mockSetupSkills, resetAgentMocks } from './helpers/mock-agents.js';

import type { ProjectMetadata } from '../src/core/types.js';

const { Project } = await import('../src/core/project/project.js');

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

describe('Project', () => {
  describe('create', () => {
    it('should create project and data directories', async () => {
      const project = await Project.create({ name: 'My Project' });

      expect(await pathExists(project.projectPath)).toBe(true);
      expect(await pathExists(project.dataPath)).toBe(true);
      expect(mockSetupSkills).toHaveBeenCalledWith(project.projectPath);
    });

    it('should write metadata.json in data directory', async () => {
      const project = await Project.create({ name: 'My Project', description: 'Test desc' });
      const metadata = await readMetadata<ProjectMetadata>(project.dataPath);

      expect(metadata.id).toBe('my-project');
      expect(metadata.name).toBe('My Project');
      expect(metadata.description).toBe('Test desc');
      expect(metadata.projectPath).toBe(project.projectPath);
      expect(metadata.createdAt).toBeDefined();
    });

    it('should slugify name for directory', async () => {
      const project = await Project.create({ name: 'Hello World Test' });

      expect(project.projectPath).toBe(join(projectsRoot, 'hello-world-test'));
      expect(project.dataPath).toBe(join(dataRoot, 'hello-world-test'));
    });

    it('should set description to null when not provided', async () => {
      const project = await Project.create({ name: 'No Desc' });
      const metadata = await project.getMetadata();

      expect(metadata.description).toBeNull();
    });

    it('should throw if project already exists', async () => {
      await Project.create({ name: 'Duplicate' });

      await expect(Project.create({ name: 'Duplicate' })).rejects.toThrow('already exists');
    });

    it('should roll back directories when skills setup fails', async () => {
      mockSetupSkills.mockRejectedValueOnce(new Error('skills setup failed'));

      await expect(Project.create({ name: 'Broken Project' })).rejects.toThrow(
        'skills setup failed'
      );

      expect(await pathExists(join(projectsRoot, 'broken-project'))).toBe(false);
      expect(await pathExists(join(dataRoot, 'broken-project'))).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array when no projects exist', async () => {
      const projects = await Project.list();
      expect(projects).toEqual([]);
    });

    it('should list all projects', async () => {
      await Project.create({ name: 'Alpha' });
      await Project.create({ name: 'Beta' });

      const projects = await Project.list();
      expect(projects).toHaveLength(2);

      const names = projects.map((p) => p.name).sort();
      expect(names).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('getById', () => {
    it('should load project by id', async () => {
      await Project.create({ name: 'Load Me' });
      const loaded = await Project.getById('load-me');

      expect(loaded.projectPath).toBe(join(projectsRoot, 'load-me'));
      expect(loaded.dataPath).toBe(join(dataRoot, 'load-me'));
    });

    it('should throw if project does not exist', async () => {
      await expect(Project.getById('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('getMetadata', () => {
    it('should return project metadata', async () => {
      const project = await Project.create({ name: 'Meta Test', description: 'desc' });
      const metadata = await project.getMetadata();

      expect(metadata.id).toBe('meta-test');
      expect(metadata.name).toBe('Meta Test');
      expect(metadata.description).toBe('desc');
    });
  });

  describe('exists', () => {
    it('should return true for existing project', async () => {
      const project = await Project.create({ name: 'Exists' });
      expect(await project.exists()).toBe(true);
    });

    it('should return false after deletion', async () => {
      const project = await Project.create({ name: 'To Delete' });
      await project.delete();
      expect(await project.exists()).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove both directories', async () => {
      const project = await Project.create({ name: 'Remove Me' });
      await project.delete();

      expect(await pathExists(project.projectPath)).toBe(false);
      expect(await pathExists(project.dataPath)).toBe(false);
    });
  });
});
