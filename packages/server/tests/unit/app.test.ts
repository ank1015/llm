import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { createApp } = await import('../../src/app.js');
const { setConfig } = await import('../../src/core/config.js');

let projectsRoot: string;
let dataRoot: string;

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-app-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-app-data-'));
  setConfig({ projectsRoot, dataRoot });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('createApp', () => {
  it('serves health and mounts API routes', async () => {
    const app = createApp();

    const healthResponse = await app.request('/health');
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ status: 'ok' });

    const projectsResponse = await app.request('/api/projects');
    expect(projectsResponse.status).toBe(200);
    expect(await projectsResponse.json()).toBeInstanceOf(Array);
  });
});
