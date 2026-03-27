import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DeleteTerminalResponseSchema,
  TerminalConflictResponseSchema,
  TerminalMetadataDtoSchema,
  TerminalSummaryDtoSchema,
} from '@ank1015/llm-app-contracts';
import { Value } from '@sinclair/typebox/value';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setConfig } from '../../../src/core/config.js';
import { resetTerminalRegistry } from '../../../src/core/terminal/terminal-registry.js';
import { createFakePtyFactory } from '../../helpers/fake-pty.js';
import { resetAgentMocks } from '../../helpers/mock-agents.js';

const { app } = await import('../../../src/index.js');

let projectsRoot: string;
let dataRoot: string;
let fakePtys: ReturnType<typeof createFakePtyFactory>;

const PROJECT = 'terminal-project';
const ARTIFACT = 'workspace';
const BASE = `/api/projects/${PROJECT}/artifacts/${ARTIFACT}/terminals`;

beforeEach(async () => {
  resetAgentMocks();
  fakePtys = createFakePtyFactory();
  resetTerminalRegistry(fakePtys.factory);
  projectsRoot = await mkdtemp(join(tmpdir(), 'terminal-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'terminal-data-'));
  setConfig({ projectsRoot, dataRoot });

  await app.request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PROJECT }),
  });
  await app.request(`/api/projects/${PROJECT}/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ARTIFACT }),
  });
});

afterEach(async () => {
  resetTerminalRegistry();
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

function patch(path: string, body: unknown) {
  return app.request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function del(path: string) {
  return app.request(path, { method: 'DELETE' });
}

describe('Terminal Routes', () => {
  it('creates, lists, fetches, and deletes artifact terminals', async () => {
    const createRes = await post(BASE, { cols: 140, rows: 44 });
    expect(createRes.status).toBe(201);

    const created = await createRes.json();
    expect(Value.Check(TerminalMetadataDtoSchema, created)).toBe(true);
    expect(created.title).toBe('Terminal 1');
    expect(created.cols).toBe(140);
    expect(created.rows).toBe(44);

    const listRes = await get(BASE);
    expect(listRes.status).toBe(200);
    const listed = await listRes.json();
    expect(listed).toHaveLength(1);
    expect(Value.Check(TerminalSummaryDtoSchema, listed[0])).toBe(true);

    const getRes = await get(`${BASE}/${created.id}`);
    expect(getRes.status).toBe(200);
    expect(Value.Check(TerminalMetadataDtoSchema, await getRes.json())).toBe(true);

    const deleteRes = await del(`${BASE}/${created.id}`);
    expect(deleteRes.status).toBe(200);
    expect(Value.Check(DeleteTerminalResponseSchema, await deleteRes.json())).toBe(true);

    const missingRes = await get(`${BASE}/${created.id}`);
    expect(missingRes.status).toBe(404);
  });

  it('validates terminal creation requests', async () => {
    const res = await post(BASE, { cols: 0 });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Invalid request body',
    });
  });

  it('blocks artifact rename while a terminal is running', async () => {
    const created = await (await post(BASE, {})).json();

    const res = await patch(`/api/projects/${PROJECT}/artifacts/${ARTIFACT}/name`, {
      name: 'renamed-workspace',
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(Value.Check(TerminalConflictResponseSchema, body)).toBe(true);
    expect(body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining('running terminal'),
        terminal: expect.objectContaining({
          id: created.id,
          artifactId: ARTIFACT,
        }),
      })
    );
  });

  it('blocks artifact deletion while a terminal is running', async () => {
    const created = await (await post(BASE, {})).json();

    const res = await del(`/api/projects/${PROJECT}/artifacts/${ARTIFACT}`);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(Value.Check(TerminalConflictResponseSchema, body)).toBe(true);
    expect(body.terminal.id).toBe(created.id);
  });

  it('blocks project deletion while a terminal is running', async () => {
    const created = await (await post(BASE, {})).json();

    const res = await del(`/api/projects/${PROJECT}`);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(Value.Check(TerminalConflictResponseSchema, body)).toBe(true);
    expect(body.terminal.id).toBe(created.id);
  });

  it('drops exited terminals so artifact lifecycle actions can proceed', async () => {
    const created = await (await post(BASE, {})).json();
    fakePtys.instances[0]!.emitExit({ exitCode: 0 });

    const renameRes = await patch(`/api/projects/${PROJECT}/artifacts/${ARTIFACT}/name`, {
      name: 'renamed-workspace',
    });
    expect(renameRes.status).toBe(200);

    const deleteProjectRes = await del(`/api/projects/${PROJECT}`);
    expect(deleteProjectRes.status).toBe(200);

    const listRes = await get(`/api/projects/${PROJECT}/artifacts/renamed-workspace/terminals`);
    expect(listRes.status).toBe(404);
    expect(created.id).toBeDefined();
  });
});
