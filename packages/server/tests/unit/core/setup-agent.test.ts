import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setConfig, getConfig } from '../../../src/core/config.js';
import {
  createCheckSetupRequirementsTool,
  createSetupAgentConfig,
} from '../../../src/core/setup-agent/setup-agent.js';
import { getSetupStatus } from '../../../src/core/setup.js';

let binRoot: string;
let homeRoot: string;
const originalConfig = getConfig();

beforeEach(async () => {
  binRoot = await mkdtemp(join(tmpdir(), 'llm-server-setup-agent-bin-'));
  homeRoot = await mkdtemp(join(tmpdir(), 'llm-server-setup-agent-home-'));
  const shellPath = await writeShell();

  vi.stubEnv('HOME', homeRoot);
  vi.stubEnv('PATH', binRoot);
  vi.stubEnv('SHELL', shellPath);
  setConfig({ projectsRoot: join(homeRoot, 'projects') });
});

afterEach(async () => {
  setConfig(originalConfig);
  vi.unstubAllEnvs();
  await rm(binRoot, { recursive: true, force: true });
  await rm(homeRoot, { recursive: true, force: true });
});

describe('setup agent config', () => {
  it('creates the setup-only tool list and prompt context', async () => {
    const status = await getSetupStatus();
    const config = await createSetupAgentConfig(status);

    expect(config.modelId).toBe('azure-openai/gpt-5.4');
    expect(config.reasoningEffort).toBe('high');
    expect(config.tools.map((tool) => tool.name)).toEqual(['bash', 'check_setup_requirements']);
    expect(config.systemPrompt).toContain('<current_setup_context>');
    expect(config.systemPrompt).toContain('<installation_priority>');
    expect(config.systemPrompt).toContain('<installation_command_examples>');
    expect(config.systemPrompt).toContain('1. Node.js and npx');
    expect(config.systemPrompt).toContain('4. chrome-controller');
    expect(config.systemPrompt).toContain('npm i -g @ank1015/chrome-controller');
    expect(config.systemPrompt).toContain('"platform"');
    expect(config.userPrompt).toContain('Missing requirements:');
  });

  it('returns setup checks and runtime context from check_setup_requirements', async () => {
    await writeCommand('node', 'v25.0.0');
    const checkTool = createCheckSetupRequirementsTool();

    const result = await checkTool.execute({
      toolCallId: 'check-1',
      params: {},
      context: { messages: [] },
    });

    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.type === 'text' ? result.content[0].content : '').toContain(
      'Node.js: installed'
    );
    expect(result.details).toMatchObject({
      status: {
        ready: false,
      },
      runtime: {
        platform: process.platform,
      },
    });
  });
});

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
