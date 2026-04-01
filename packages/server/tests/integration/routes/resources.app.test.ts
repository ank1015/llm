import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../src/app.js';
import { Session } from '../../../src/core/session/session.js';
import { ArtifactDir } from '../../../src/core/artifact-dir/artifact-dir.js';
import { resetTerminalRegistry } from '../../../src/core/terminal/terminal-registry.js';
import { createFakePtyFactory } from '../../helpers/fake-pty.js';
import { createTempServerConfig, jsonRequest } from '../../helpers/server-fixture.js';

let cleanup: (() => Promise<void>) | null = null;
let projectsRoot = '';
let app = createApp();

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-app-integration');
  projectsRoot = fixture.projectsRoot;
  cleanup = fixture.cleanup;
  resetTerminalRegistry(createFakePtyFactory().factory);
  app = createApp();
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('mounted app resource routes', () => {
  it('creates projects and artifacts, serves file-index, and blocks project deletion with a live terminal', async () => {
    const createProjectResponse = await jsonRequest(app, '/api/projects', 'POST', {
      name: 'Project Alpha',
      description: 'Primary project',
    });
    expect(createProjectResponse.status).toBe(201);

    const createArtifactResponse = await jsonRequest(
      app,
      '/api/projects/project-alpha/artifacts',
      'POST',
      {
        name: 'Research',
      }
    );
    expect(createArtifactResponse.status).toBe(201);

    await Session.create('project-alpha', 'research', {
      name: 'Alpha Session',
      modelId: 'codex/gpt-5.4-mini',
    });

    const artifactDir = await ArtifactDir.getById('project-alpha', 'research');
    await mkdir(join(artifactDir.dirPath, 'notes'), { recursive: true });
    await writeFile(join(artifactDir.dirPath, 'notes', 'todo.txt'), 'ship mounted app tests', 'utf8');

    const overviewResponse = await app.request('/api/projects/project-alpha/overview');
    expect(overviewResponse.status).toBe(200);
    expect(await overviewResponse.json()).toMatchObject({
      project: {
        id: 'project-alpha',
        name: 'Project Alpha',
      },
      artifactDirs: [
        {
          id: 'research',
          sessions: [{ sessionName: 'Alpha Session' }],
        },
      ],
    });

    const fileIndexResponse = await app.request('/api/projects/project-alpha/file-index?query=todo');
    expect(fileIndexResponse.status).toBe(200);
    expect(await fileIndexResponse.json()).toMatchObject({
      projectId: 'project-alpha',
      query: 'todo',
      files: [
        expect.objectContaining({
          artifactId: 'research',
          artifactName: 'Research',
          path: 'notes/todo.txt',
          type: 'file',
          artifactPath: 'research/notes/todo.txt',
        }),
      ],
    });

    const createTerminalResponse = await jsonRequest(
      app,
      '/api/projects/project-alpha/artifacts/research/terminals',
      'POST',
      { cols: 90, rows: 20 }
    );
    expect(createTerminalResponse.status).toBe(201);

    const deleteProjectResponse = await app.request('/api/projects/project-alpha', {
      method: 'DELETE',
    });
    expect(deleteProjectResponse.status).toBe(409);
    expect(await deleteProjectResponse.json()).toMatchObject({
      error: expect.stringContaining('running terminal'),
      terminal: expect.objectContaining({
        status: 'running',
      }),
    });
  });

  it('serves mounted health and terminal list routes through /api', async () => {
    expect(await (await app.request('/health')).json()).toEqual({ status: 'ok' });

    await jsonRequest(app, '/api/projects', 'POST', { name: 'Terminal Project' });
    await jsonRequest(app, '/api/projects/terminal-project/artifacts', 'POST', { name: 'Shell' });
    await jsonRequest(app, '/api/projects/terminal-project/artifacts/shell/terminals', 'POST', {});

    const listResponse = await app.request('/api/projects/terminal-project/artifacts/shell/terminals');
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual([
      expect.objectContaining({
        title: 'Terminal 1',
        status: 'running',
        projectId: 'terminal-project',
        artifactId: 'shell',
      }),
    ]);
  });
});
