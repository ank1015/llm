import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pathExists, readMetadata } from '../../../src/core/storage/fs.js';
import { Project } from '../../../src/core/project/project.js';
import { createTempServerConfig } from '../../helpers/server-fixture.js';

import type { ProjectMetadata } from '../../../src/types/index.js';

let cleanup: (() => Promise<void>) | null = null;
let projectsRoot = '';
let dataRoot = '';

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-project-unit');
  projectsRoot = fixture.projectsRoot;
  dataRoot = fixture.dataRoot;
  cleanup = fixture.cleanup;
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('Project', () => {
  it('creates project working/data directories and persists metadata', async () => {
    const project = await Project.create({
      name: 'My Project',
      description: 'Test desc',
      projectImg: 'https://example.com/project.png',
    });

    expect(await pathExists(project.projectPath)).toBe(true);
    expect(await pathExists(project.dataPath)).toBe(true);
    expect(project.projectPath).toBe(join(projectsRoot, 'my-project'));
    expect(project.dataPath).toBe(join(dataRoot, 'my-project'));

    const metadata = await readMetadata<ProjectMetadata>(project.dataPath);
    expect(metadata).toMatchObject({
      id: 'my-project',
      name: 'My Project',
      description: 'Test desc',
      projectImg: 'https://example.com/project.png',
      projectPath: project.projectPath,
    });
    expect(metadata.createdAt).toBeTruthy();
  });

  it('lists, loads, renames, and deletes projects', async () => {
    await Project.create({ name: 'Alpha' });
    const beta = await Project.create({ name: 'Beta' });

    const listed = await Project.list();
    expect(listed.map((project) => project.name).sort()).toEqual(['Alpha', 'Beta']);

    const loaded = await Project.getByName('Beta');
    expect(await loaded.getMetadata()).toMatchObject({
      id: 'beta',
      name: 'Beta',
      description: null,
      projectImg: null,
    });

    const renamed = await loaded.rename('Beta Prime');
    expect(renamed).toMatchObject({
      id: 'beta',
      name: 'Beta Prime',
    });

    const updatedProjectImg = await loaded.updateProjectImg('https://example.com/beta.png');
    expect(updatedProjectImg.projectImg).toBe('https://example.com/beta.png');

    await beta.delete();
    expect(await beta.exists()).toBe(false);
  });

  it('rejects duplicate and missing projects', async () => {
    await Project.create({ name: 'Duplicate' });

    await expect(Project.create({ name: 'Duplicate' })).rejects.toThrow('already exists');
    await expect(Project.getById('missing-project')).rejects.toThrow('not found');
  });
});
