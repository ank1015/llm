import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { setConfig } = await import('../../../src/core/config.js');
const { Project } = await import('../../../src/core/project/project.js');
const { ArtifactDir } = await import('../../../src/core/artifact-dir/artifact-dir.js');
const { Session } = await import('../../../src/core/session/session.js');
const { projectRoutes } = await import('../../../src/routes/projects.js');
const { artifactDirRoutes } = await import('../../../src/routes/artifact-dirs.js');
const { terminalRoutes } = await import('../../../src/routes/terminals.js');
const { resetTerminalRegistry } = await import('../../../src/core/terminal/terminal-registry.js');

let projectsRoot: string;
let dataRoot: string;

function jsonRequest(
  route: { request: (input: string, init?: RequestInit) => Promise<Response> },
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return route.request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function createFakePtyProcess() {
  let onExitListener: ((event: { exitCode: number; signal?: number }) => void) | null = null;

  return {
    pid: 1,
    write: () => undefined,
    resize: () => undefined,
    kill: () => {
      onExitListener?.({ exitCode: 0 });
    },
    onData: () => ({ dispose: () => undefined }),
    onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
      onExitListener = listener;
      return {
        dispose: () => {
          if (onExitListener === listener) {
            onExitListener = null;
          }
        },
      };
    },
  };
}

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-resource-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-resource-data-'));
  setConfig({ projectsRoot, dataRoot });
  resetTerminalRegistry(() => createFakePtyProcess());
});

afterEach(async () => {
  resetTerminalRegistry();
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('project, artifact, and terminal routes', () => {
  it('serves project and file-index DTOs from local contracts', async () => {
    const createProjectResponse = await jsonRequest(projectRoutes, '/projects', 'POST', {
      name: 'Project Alpha',
      description: 'Primary project',
    });
    expect(createProjectResponse.status).toBe(201);
    expect(await createProjectResponse.json()).toMatchObject({
      id: 'project-alpha',
      name: 'Project Alpha',
      description: 'Primary project',
      projectImg: null,
    });

    await jsonRequest(projectRoutes, '/projects/project-img', 'PATCH', {
      projectId: 'project-alpha',
      projectImg: 'https://example.com/cover.png',
    });
    await jsonRequest(projectRoutes, '/projects/project-alpha/name', 'PATCH', {
      name: 'Project Beta',
    });

    const createArtifactResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/project-alpha/artifacts',
      'POST',
      { name: 'Research' }
    );
    expect(createArtifactResponse.status).toBe(201);
    expect(await createArtifactResponse.json()).toMatchObject({
      id: 'research',
      name: 'Research',
    });

    await Session.create('project-alpha', 'research', {
      name: 'Alpha Session',
      modelId: 'openai/gpt-5.4-mini',
    });

    const artifactDir = await ArtifactDir.getById('project-alpha', 'research');
    await mkdir(join(artifactDir.dirPath, 'notes'), { recursive: true });
    await writeFile(join(artifactDir.dirPath, 'notes', 'todo.txt'), 'ship route tests', 'utf8');

    const overviewResponse = await jsonRequest(
      projectRoutes,
      '/projects/project-alpha/overview',
      'GET'
    );
    expect(overviewResponse.status).toBe(200);
    expect(await overviewResponse.json()).toMatchObject({
      project: {
        id: 'project-alpha',
        name: 'Project Beta',
        projectImg: 'https://example.com/cover.png',
      },
      artifactDirs: [
        {
          id: 'research',
          sessions: [{ sessionName: 'Alpha Session' }],
        },
      ],
    });

    const fileIndexResponse = await jsonRequest(
      projectRoutes,
      '/projects/project-alpha/file-index?query=todo&limit=5',
      'GET'
    );
    expect(fileIndexResponse.status).toBe(200);
    const fileIndex = (await fileIndexResponse.json()) as {
      projectId: string;
      query: string;
      files: Array<Record<string, unknown>>;
      truncated: boolean;
    };
    expect(fileIndex.projectId).toBe('project-alpha');
    expect(fileIndex.query).toBe('todo');
    expect(fileIndex.files[0]).toMatchObject({
      artifactId: 'research',
      artifactName: 'Research',
      path: 'notes/todo.txt',
      type: 'file',
      artifactPath: 'research/notes/todo.txt',
    });
  });

  it('handles artifact explorer and file mutations and leaves skill routes absent', async () => {
    await Project.create({ name: 'Artifacts Project' });
    await ArtifactDir.create('artifacts-project', { name: 'Assets' });

    const artifactDir = await ArtifactDir.getById('artifacts-project', 'assets');
    await writeFile(join(artifactDir.dirPath, 'alpha.txt'), 'artifact body', 'utf8');

    const explorerResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/explorer',
      'GET'
    );
    expect(explorerResponse.status).toBe(200);
    expect(await explorerResponse.json()).toMatchObject({
      path: '',
      entries: [
        { name: '.max', type: 'directory' },
        { name: 'alpha.txt', type: 'file' },
      ],
    });

    const fileResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/file?path=alpha.txt',
      'GET'
    );
    expect(fileResponse.status).toBe(200);
    expect(await fileResponse.json()).toMatchObject({
      path: 'alpha.txt',
      content: 'artifact body',
      isBinary: false,
    });

    const rawResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/file/raw?path=alpha.txt',
      'GET'
    );
    expect(rawResponse.status).toBe(200);
    expect(await rawResponse.text()).toBe('artifact body');

    const renameResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/path/rename',
      'PATCH',
      { path: 'alpha.txt', newName: 'beta.txt' }
    );
    expect(renameResponse.status).toBe(200);
    expect(await renameResponse.json()).toEqual({
      ok: true,
      oldPath: 'alpha.txt',
      newPath: 'beta.txt',
      type: 'file',
    });

    const deleteResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/path?path=beta.txt',
      'DELETE'
    );
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({
      ok: true,
      deleted: true,
      path: 'beta.txt',
      type: 'file',
    });

    const skillGetResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/skills',
      'GET'
    );
    expect(skillGetResponse.status).toBe(404);

    const skillPostResponse = await jsonRequest(
      artifactDirRoutes,
      '/projects/artifacts-project/artifacts/assets/skills',
      'POST',
      { skillName: 'anything' }
    );
    expect(skillPostResponse.status).toBe(404);
  });

  it('creates, lists, gets, and deletes terminals with local DTOs', async () => {
    await Project.create({ name: 'Terminal Project' });
    await ArtifactDir.create('terminal-project', { name: 'Shell' });

    const createResponse = await jsonRequest(
      terminalRoutes,
      '/projects/terminal-project/artifacts/shell/terminals',
      'POST',
      { cols: 90, rows: 20 }
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      id: string;
      title: string;
      status: string;
      cwdAtLaunch: string;
      shell: string;
    };
    expect(created).toMatchObject({
      title: 'Terminal 1',
      status: 'running',
      cwdAtLaunch: join(projectsRoot, 'terminal-project', 'shell'),
    });

    const listResponse = await jsonRequest(
      terminalRoutes,
      '/projects/terminal-project/artifacts/shell/terminals',
      'GET'
    );
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as Array<Record<string, unknown>>;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: created.id,
      title: 'Terminal 1',
      status: 'running',
    });
    expect('cwdAtLaunch' in listed[0]!).toBe(false);

    const getResponse = await jsonRequest(
      terminalRoutes,
      `/projects/terminal-project/artifacts/shell/terminals/${created.id}`,
      'GET'
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({
      id: created.id,
      title: 'Terminal 1',
      cwdAtLaunch: join(projectsRoot, 'terminal-project', 'shell'),
    });

    const deleteResponse = await jsonRequest(
      terminalRoutes,
      `/projects/terminal-project/artifacts/shell/terminals/${created.id}`,
      'DELETE'
    );
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({
      deleted: true,
      terminalId: created.id,
    });
  });
});
