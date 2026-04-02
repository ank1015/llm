import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArtifactDir } from '../../../src/core/artifact-dir/artifact-dir.js';
import { Project } from '../../../src/core/project/project.js';
import { pathExists, readMetadata } from '../../../src/core/storage/fs.js';
import { createTempServerConfig } from '../../helpers/server-fixture.js';

import type { ArtifactDirMetadata } from '../../../src/types/index.js';

let cleanup: (() => Promise<void>) | null = null;
let projectsRoot = '';
let dataRoot = '';

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-artifact-unit');
  projectsRoot = fixture.projectsRoot;
  dataRoot = fixture.dataRoot;
  cleanup = fixture.cleanup;

  await Project.create({ name: 'Test Project' });
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('ArtifactDir', () => {
  it('creates working/data directories and persists metadata', async () => {
    const artifact = await ArtifactDir.create('test-project', {
      name: 'Research',
      description: 'Research findings',
    });

    expect(await pathExists(artifact.dirPath)).toBe(true);
    expect(await pathExists(artifact.dataPath)).toBe(true);
    expect(artifact.dirPath).toBe(join(projectsRoot, 'test-project', 'research'));
    expect(artifact.dataPath).toBe(join(dataRoot, 'test-project', 'artifacts', 'research'));

    const metadata = await readMetadata<ArtifactDirMetadata>(artifact.dataPath);
    expect(metadata).toMatchObject({
      id: 'research',
      name: 'Research',
      description: 'Research findings',
    });
    expect(metadata.createdAt).toBeTruthy();

    expect(await pathExists(join(artifact.dirPath, '.max'))).toBe(true);
    expect(await pathExists(join(artifact.dirPath, '.max', 'skills'))).toBe(true);
    expect(await pathExists(join(artifact.dirPath, '.max', 'temp', 'scripts'))).toBe(true);
    expect(await pathExists(join(artifact.dirPath, '.max', 'temp', 'package.json'))).toBe(true);
    expect(await pathExists(join(artifact.dirPath, '.max', 'temp', 'tsconfig.json'))).toBe(true);
    expect(
      await pathExists(
        join(artifact.dirPath, '.max', 'temp', 'node_modules', '@ank1015', 'llm-agents')
      )
    ).toBe(true);
    expect(await pathExists(join(artifact.dirPath, '.max', 'temp', 'node_modules', 'tsx'))).toBe(
      true
    );
    expect(
      await pathExists(join(artifact.dirPath, '.max', 'temp', 'node_modules', '.bin', 'tsx'))
    ).toBe(true);

    const tempPackage = JSON.parse(
      (await artifact.readArtifactFile('.max/temp/package.json')).content
    ) as {
      private?: boolean;
      type?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(tempPackage.private).toBe(true);
    expect(tempPackage.type).toBe('module');
    expect(tempPackage.dependencies?.['@ank1015/llm-agents']).toBeTruthy();
    expect(tempPackage.devDependencies?.tsx).toBeTruthy();
  });

  it('lists, loads, renames, and deletes artifact directories', async () => {
    await ArtifactDir.create('test-project', { name: 'Docs' });
    const code = await ArtifactDir.create('test-project', { name: 'Code' });

    const listed = await ArtifactDir.list('test-project');
    expect(listed.map((artifact) => artifact.name).sort()).toEqual(['Code', 'Docs']);

    const loaded = await ArtifactDir.getById('test-project', 'code');
    expect(await loaded.getMetadata()).toMatchObject({
      id: 'code',
      name: 'Code',
      description: null,
    });

    const renamedMetadata = await loaded.rename('Source Code');
    expect(renamedMetadata).toMatchObject({
      id: 'source-code',
      name: 'Source Code',
    });

    const renamedArtifact = await ArtifactDir.getById('test-project', 'source-code');
    await renamedArtifact.delete();
    expect(await renamedArtifact.exists()).toBe(false);

    await expect(code.exists()).resolves.toBe(false);
  });

  it('lists artifact entries, reads files, and mutates paths', async () => {
    const artifact = await ArtifactDir.create('test-project', { name: 'Assets' });
    await mkdir(join(artifact.dirPath, 'notes'), { recursive: true });
    await writeFile(join(artifact.dirPath, 'notes', 'todo.txt'), 'ship tests', 'utf8');
    await writeFile(join(artifact.dirPath, 'report.md'), '# Report', 'utf8');

    expect(await artifact.listArtifacts()).toEqual(['report.md']);

    const explorer = await artifact.listArtifactEntries();
    expect(explorer).toMatchObject({
      path: '',
      entries: [
        expect.objectContaining({ name: '.max', type: 'directory' }),
        expect.objectContaining({ name: 'notes', type: 'directory' }),
        expect.objectContaining({ name: 'report.md', type: 'file' }),
      ],
    });

    const file = await artifact.readArtifactFile('notes/todo.txt');
    expect(file).toMatchObject({
      path: 'notes/todo.txt',
      content: 'ship tests',
      isBinary: false,
      truncated: false,
    });

    const updated = await artifact.writeArtifactFile('notes/todo.txt', 'ship updated tests');
    expect(updated).toMatchObject({
      path: 'notes/todo.txt',
      content: 'ship updated tests',
      isBinary: false,
      truncated: false,
    });

    const reloaded = await artifact.readArtifactFile('notes/todo.txt');
    expect(reloaded.content).toBe('ship updated tests');

    const renamed = await artifact.renameArtifactPath('notes/todo.txt', 'done.txt');
    expect(renamed).toEqual({
      oldPath: 'notes/todo.txt',
      newPath: 'notes/done.txt',
      type: 'file',
    });

    const deleted = await artifact.deleteArtifactPath('notes/done.txt');
    expect(deleted).toEqual({
      path: 'notes/done.txt',
      type: 'file',
    });
  });

  it('rejects duplicate and missing artifact directories', async () => {
    await ArtifactDir.create('test-project', { name: 'Duplicate' });

    await expect(ArtifactDir.create('test-project', { name: 'Duplicate' })).rejects.toThrow(
      'already exists'
    );
    await expect(ArtifactDir.getById('test-project', 'missing-artifact')).rejects.toThrow(
      'not found'
    );
  });
});
