import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentEvent, AgentResult, AgentRun } from '@ank1015/llm-sdk';

const mockAgent = vi.fn();

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();

  return {
    ...actual,
    agent: mockAgent,
  };
});

const { createApp } = await import('../../../src/app.js');
const { getConfig, setConfig } = await import('../../../src/core/config.js');
const { resetSetupAgentRunRegistry } =
  await import('../../../src/core/setup-agent/run-registry.js');

let binRoot: string;
let homeRoot: string;
const originalConfig = getConfig();

beforeEach(async () => {
  binRoot = await mkdtemp(join(tmpdir(), 'llm-server-setup-agent-route-bin-'));
  homeRoot = await mkdtemp(join(tmpdir(), 'llm-server-setup-agent-route-home-'));
  const shellPath = await writeShell();

  vi.stubEnv('HOME', homeRoot);
  vi.stubEnv('PATH', binRoot);
  vi.stubEnv('SHELL', shellPath);
  setConfig({ projectsRoot: join(homeRoot, 'projects') });
  resetSetupAgentRunRegistry();
  mockAgent.mockReset();
});

afterEach(async () => {
  setConfig(originalConfig);
  resetSetupAgentRunRegistry();
  vi.unstubAllEnvs();
  await rm(binRoot, { recursive: true, force: true });
  await rm(homeRoot, { recursive: true, force: true });
});

describe('setup agent routes', () => {
  it('refuses to start the setup agent when setup is already ready', async () => {
    await Promise.all([
      writeCommand('node', 'v25.0.0'),
      writeCommand('npx', '11.0.0'),
      writeCommand('python3', 'Python 3.13.0'),
      writeCommand('git', 'git version 2.50.0'),
      writeCommand('chrome-controller', '1.0.0'),
    ]);

    const app = createApp();
    const response = await app.request('/api/setup/agent/start', { method: 'POST' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Setup requirements are already installed.',
    });
    expect(mockAgent).not.toHaveBeenCalled();
  });

  it('streams setup agent events and completion', async () => {
    const events: AgentEvent[] = [
      { type: 'agent_start' },
      {
        type: 'tool_execution_start',
        toolCallId: 'check-1',
        toolName: 'check_setup_requirements',
        args: {},
      },
      {
        type: 'tool_execution_end',
        toolCallId: 'check-1',
        toolName: 'check_setup_requirements',
        result: { content: [{ type: 'text', content: 'ready: false' }] },
        isError: false,
      },
      { type: 'agent_end', agentMessages: [] },
    ];
    mockAgent.mockReturnValue(createMockAgentRun(events));

    const app = createApp();
    const startResponse = await app.request('/api/setup/agent/start', { method: 'POST' });

    expect(startResponse.status).toBe(200);
    const startBody = (await startResponse.json()) as { run: { runId: string } };

    const streamResponse = await app.request(`/api/setup/agent/runs/${startBody.run.runId}/stream`);
    const body = await streamResponse.text();

    expect(mockAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'azure-openai/gpt-5.4',
        reasoningEffort: 'high',
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'bash' }),
          expect.objectContaining({ name: 'check_setup_requirements' }),
        ]),
      })
    );
    expect(streamResponse.status).toBe(200);
    expect(body).toContain('event: ready');
    expect(body).toContain('event: agent_event');
    expect(body).toContain('tool_execution_start');
    expect(body).toContain('event: done');
  });
});

function createMockAgentRun(events: AgentEvent[]): AgentRun {
  const resultPromise = Promise.resolve({
    ok: true,
    sessionPath: '/tmp/setup-agent.jsonl',
    sessionId: 'setup-session',
    branch: 'main',
    headId: 'setup-head',
    messages: [],
    newMessages: [],
    turns: 1,
    totalTokens: 0,
    totalCost: 0,
  } satisfies AgentResult);

  return {
    sessionPath: '/tmp/setup-agent.jsonl',
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    drain: () => resultPromise,
    then: resultPromise.then.bind(resultPromise),
    catch: resultPromise.catch.bind(resultPromise),
    finally: resultPromise.finally.bind(resultPromise),
  };
}

async function writeCommand(command: string, version: string): Promise<void> {
  const path = join(binRoot, command);

  await writeFile(path, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
  await chmod(path, 0o755);
}

async function writeShell(): Promise<string> {
  const path = join(binRoot, 'test-shell');

  await writeFile(
    path,
    `#!/bin/sh\nif [ "$1" = "-lc" ]; then\n  shift\nfi\nexec /bin/sh -c "$1"\n`
  );
  await chmod(path, 0o755);

  return path;
}
