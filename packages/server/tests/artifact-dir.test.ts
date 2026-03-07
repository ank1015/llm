import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { setConfig } from '../src/core/config.js';
import { pathExists, readMetadata } from '../src/core/storage/fs.js';

import { resetAgentMocks } from './helpers/mock-agents.js';

import type { ArtifactDirMetadata } from '../src/core/types.js';

const { ArtifactDir } = await import('../src/core/artifact-dir/artifact-dir.js');
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

describe('ArtifactDir', () => {
  const PROJECT_NAME = 'test-project';

  beforeEach(async () => {
    await Project.create({ name: PROJECT_NAME });
  });

  describe('create', () => {
    it('should create working and data directories', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'research' });

      expect(await pathExists(dir.dirPath)).toBe(true);
      expect(await pathExists(dir.dataPath)).toBe(true);
    });

    it('should write metadata.json in data directory', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, {
        name: 'Research',
        description: 'Research findings',
      });
      const metadata = await readMetadata<ArtifactDirMetadata>(dir.dataPath);

      expect(metadata.id).toBe('research');
      expect(metadata.name).toBe('Research');
      expect(metadata.description).toBe('Research findings');
      expect(metadata.createdAt).toBeDefined();
    });

    it('should place working dir inside project directory', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'assets' });

      expect(dir.dirPath).toBe(join(projectsRoot, PROJECT_NAME, 'assets'));
    });

    it('should place data dir inside project data directory', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'assets' });

      expect(dir.dataPath).toBe(join(dataRoot, PROJECT_NAME, 'artifacts', 'assets'));
    });

    it('should set description to null when not provided', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'no-desc' });
      const metadata = await dir.getMetadata();

      expect(metadata.description).toBeNull();
    });

    it('should throw if artifact dir already exists', async () => {
      await ArtifactDir.create(PROJECT_NAME, { name: 'dup' });

      await expect(ArtifactDir.create(PROJECT_NAME, { name: 'dup' })).rejects.toThrow(
        'already exists'
      );
    });
  });

  describe('list', () => {
    it('should return empty array when no artifact dirs exist', async () => {
      const dirs = await ArtifactDir.list(PROJECT_NAME);
      expect(dirs).toEqual([]);
    });

    it('should list all artifact directories', async () => {
      await ArtifactDir.create(PROJECT_NAME, { name: 'research' });
      await ArtifactDir.create(PROJECT_NAME, { name: 'code' });

      const dirs = await ArtifactDir.list(PROJECT_NAME);
      expect(dirs).toHaveLength(2);

      const names = dirs.map((d) => d.name).sort();
      expect(names).toEqual(['code', 'research']);
    });
  });

  describe('getById', () => {
    it('should load artifact dir by id', async () => {
      await ArtifactDir.create(PROJECT_NAME, { name: 'findings' });
      const loaded = await ArtifactDir.getById(PROJECT_NAME, 'findings');

      expect(loaded.dirPath).toBe(join(projectsRoot, PROJECT_NAME, 'findings'));
    });

    it('should throw if artifact dir does not exist', async () => {
      await expect(ArtifactDir.getById(PROJECT_NAME, 'nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('listArtifacts', () => {
    it('should return empty array for empty directory', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'empty' });
      const files = await dir.listArtifacts();

      expect(files).toEqual([]);
    });

    it('should list files in the working directory', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'with-files' });

      // Write some artifact files
      await writeFile(join(dir.dirPath, 'report.md'), '# Report');
      await writeFile(join(dir.dirPath, 'data.json'), '{}');

      const files = await dir.listArtifacts();
      expect(files.sort()).toEqual(['data.json', 'report.md']);
    });
  });

  describe('exists', () => {
    it('should return true for existing artifact dir', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'exists' });
      expect(await dir.exists()).toBe(true);
    });

    it('should return false after deletion', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'delete-me' });
      await dir.delete();
      expect(await dir.exists()).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove both directories', async () => {
      const dir = await ArtifactDir.create(PROJECT_NAME, { name: 'remove' });
      await dir.delete();

      expect(await pathExists(dir.dirPath)).toBe(false);
      expect(await pathExists(dir.dataPath)).toBe(false);
    });
  });
});
