import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  allTools,
  codingTools,
  createAllTools,
  createCodingTools,
  createExecCommandTool,
  createReadOnlyTools,
  createUnifiedExecProcessManager,
  createUnifiedExecTools,
  createWriteStdinTool,
  readOnlyTools,
  resolveUnifiedExecCommand,
} from '../../../src/tools/index.js';

import type { UnifiedExecPtyProcess } from '../../../src/tools/index.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'llm-agents-unified-exec-'));
  tempDirs.push(dir);
  return dir;
}

function nodeCommand(source: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`;
}

function textContent(result: { content: Array<{ type: string; content?: string }> }): string {
  const item = result.content[0];
  return item?.type === 'text' ? item.content : '';
}

async function cleanupManager(manager: { terminateAll: () => void }): Promise<void> {
  manager.terminateAll();
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('unified exec tools', () => {
  it('advertises the exec_command schema without sandbox or approval fields', () => {
    const tool = createExecCommandTool('/workspace');

    expect(tool.name).toBe('exec_command');
    expect(tool.strict).toBe(false);
    expect(tool.parameters.required).toEqual(['cmd']);
    expect(tool.parameters.additionalProperties).toBe(false);
    expect(Object.keys(tool.parameters.properties)).toEqual([
      'cmd',
      'workdir',
      'shell',
      'tty',
      'yield_time_ms',
      'max_output_tokens',
      'login',
    ]);
    expect(tool.parameters.properties).not.toHaveProperty('sandbox_permissions');
    expect(tool.parameters.properties).not.toHaveProperty('justification');
    expect(tool.parameters.properties).not.toHaveProperty('prefix_rule');
  });

  it('advertises the write_stdin schema', () => {
    const tool = createWriteStdinTool();

    expect(tool.name).toBe('write_stdin');
    expect(tool.strict).toBe(false);
    expect(tool.parameters.required).toEqual(['session_id']);
    expect(tool.parameters.additionalProperties).toBe(false);
    expect(Object.keys(tool.parameters.properties)).toEqual([
      'session_id',
      'chars',
      'yield_time_ms',
      'max_output_tokens',
    ]);
  });

  it('runs a quick command and reports the exit code', async () => {
    const cwd = await createTempDir();
    const { execCommandTool, manager } = createUnifiedExecTools(cwd);

    try {
      const result = await execCommandTool.execute({
        toolCallId: 'exec-quick',
        params: { cmd: nodeCommand("console.log('quick-output')"), login: false },
        context: { messages: [] },
      });

      expect(textContent(result)).toContain('Process exited with code 0');
      expect(textContent(result)).toContain('quick-output');
      expect(result.details?.exit_code).toBe(0);
      expect(result.details?.session_id).toBeUndefined();
    } finally {
      await cleanupManager(manager);
    }
  });

  it('returns a session id for a long-running command and polls later output', async () => {
    const cwd = await createTempDir();
    const { execCommandTool, writeStdinTool, manager } = createUnifiedExecTools(cwd);

    try {
      const first = await execCommandTool.execute({
        toolCallId: 'exec-long',
        params: {
          cmd: nodeCommand("setTimeout(() => console.log('later-output'), 500)"),
          login: false,
          yield_time_ms: 1,
        },
        context: { messages: [] },
      });
      const sessionId = first.details?.session_id;

      expect(sessionId).toEqual(expect.any(Number));
      expect(textContent(first)).toContain(`Process running with session ID ${sessionId}`);

      const second = await writeStdinTool.execute({
        toolCallId: 'poll-long',
        params: { session_id: sessionId!, chars: '', yield_time_ms: 10 },
        context: { messages: [] },
      });

      expect(textContent(second)).toContain('later-output');
      expect(second.details?.exit_code).toBe(0);
      expect(second.details?.session_id).toBeUndefined();
    } finally {
      await cleanupManager(manager);
    }
  });

  it('supports interactive tty writes through an injected PTY', async () => {
    const cwd = await createTempDir();
    const fakePtys: FakePty[] = [];
    const { execCommandTool, writeStdinTool, manager } = createUnifiedExecTools(cwd, {
      nextSessionId: () => 1234,
      operations: {
        spawnPty: () => {
          const pty = new FakePty();
          fakePtys.push(pty);
          queueMicrotask(() => pty.emitData('ready\n'));
          return pty;
        },
      },
    });

    try {
      const opened = await execCommandTool.execute({
        toolCallId: 'exec-tty',
        params: { cmd: 'bash -i', tty: true, login: false, yield_time_ms: 1 },
        context: { messages: [] },
      });

      expect(opened.details?.session_id).toBe(1234);
      expect(textContent(opened)).toContain('ready');

      const written = await writeStdinTool.execute({
        toolCallId: 'write-tty',
        params: { session_id: 1234, chars: 'echo hi\n', yield_time_ms: 1 },
        context: { messages: [] },
      });

      expect(fakePtys[0]?.writes).toEqual(['echo hi\n']);
      expect(textContent(written)).toContain('ran: echo hi');
    } finally {
      await cleanupManager(manager);
    }
  });

  it('rejects non-empty stdin for non-tty sessions', async () => {
    const cwd = await createTempDir();
    const { execCommandTool, writeStdinTool, manager } = createUnifiedExecTools(cwd);

    try {
      const first = await execCommandTool.execute({
        toolCallId: 'exec-non-tty',
        params: {
          cmd: nodeCommand('setTimeout(() => {}, 1000)'),
          login: false,
          yield_time_ms: 1,
        },
        context: { messages: [] },
      });

      await expect(
        writeStdinTool.execute({
          toolCallId: 'write-non-tty',
          params: { session_id: first.details!.session_id!, chars: 'x' },
          context: { messages: [] },
        })
      ).rejects.toThrow(
        'stdin is closed for this session; rerun exec_command with tty=true to keep stdin open'
      );
    } finally {
      await cleanupManager(manager);
    }
  });

  it('rejects unknown sessions', async () => {
    const manager = createUnifiedExecProcessManager();
    const tool = createWriteStdinTool({ manager });

    await expect(
      tool.execute({
        toolCallId: 'unknown',
        params: { session_id: 404, chars: '' },
        context: { messages: [] },
      })
    ).rejects.toThrow('write_stdin failed: Unknown process id 404');
  });

  it('resolves workdir relative to the tool cwd', async () => {
    const cwd = await createTempDir();
    const nested = join(cwd, 'nested');
    await mkdir(nested);
    const { execCommandTool, manager } = createUnifiedExecTools(cwd);

    try {
      const result = await execCommandTool.execute({
        toolCallId: 'exec-workdir',
        params: {
          cmd: nodeCommand('console.log(process.cwd())'),
          workdir: 'nested',
          login: false,
        },
        context: { messages: [] },
      });

      expect(textContent(result)).toContain(nested);
    } finally {
      await cleanupManager(manager);
    }
  });

  it('maps shells and login options like Codex', () => {
    expect(resolveUnifiedExecCommand('echo hi', { shell: '/bin/bash', login: true })).toMatchObject(
      {
        command: '/bin/bash',
        args: ['-lc', 'echo hi'],
        shellType: 'bash',
      }
    );
    expect(resolveUnifiedExecCommand('echo hi', { shell: '/bin/zsh', login: false }).args).toEqual([
      '-c',
      'echo hi',
    ]);
    expect(
      resolveUnifiedExecCommand('Write-Output hi', { shell: 'powershell', login: false }).args
    ).toEqual(['-NoProfile', '-Command', 'Write-Output hi']);
    expect(resolveUnifiedExecCommand('dir', { shell: 'cmd', login: true }).args).toEqual([
      '/c',
      'dir',
    ]);
  });

  it('truncates output using max_output_tokens and keeps original token count', async () => {
    const cwd = await createTempDir();
    const { execCommandTool, manager } = createUnifiedExecTools(cwd);

    try {
      const result = await execCommandTool.execute({
        toolCallId: 'exec-truncate',
        params: {
          cmd: nodeCommand("console.log('a'.repeat(200))"),
          login: false,
          max_output_tokens: 5,
        },
        context: { messages: [] },
      });

      expect(result.details?.original_token_count).toBeGreaterThan(5);
      expect(textContent(result)).toContain('output truncated to 5 tokens');
    } finally {
      await cleanupManager(manager);
    }
  });

  it('cleans up sessions when an execution is aborted', async () => {
    const cwd = await createTempDir();
    const controller = new AbortController();
    const manager = createUnifiedExecProcessManager({ nextSessionId: () => 2222 });
    const tool = createExecCommandTool(cwd, { manager });

    const promise = tool.execute({
      toolCallId: 'exec-abort',
      params: { cmd: nodeCommand('setTimeout(() => {}, 2000)'), login: false },
      signal: controller.signal,
      context: { messages: [] },
    });

    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toThrow('Operation aborted');
    expect(manager.hasSession(2222)).toBe(false);
  });

  it('exports tools without adding them to bundled defaults', () => {
    expect(codingTools.map((tool) => tool.name)).not.toContain('exec_command');
    expect(codingTools.map((tool) => tool.name)).not.toContain('write_stdin');
    expect(readOnlyTools.map((tool) => tool.name)).not.toContain('exec_command');
    expect(Object.keys(allTools)).not.toContain('exec_command');
    expect(createCodingTools('/workspace').map((tool) => tool.name)).not.toContain('exec_command');
    expect(Object.keys(createAllTools('/workspace'))).not.toContain('write_stdin');
    expect(createReadOnlyTools('/workspace').map((tool) => tool.name)).not.toContain('write_stdin');
  });
});

class FakePty implements UnifiedExecPtyProcess {
  readonly pid = 123;
  readonly writes: string[] = [];
  readonly kills: Array<string | undefined> = [];
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<(event: { exitCode: number }) => void>();

  write(data: string): void {
    this.writes.push(data);
    this.emitData(`ran: ${data}`);
  }

  kill(signal?: string): void {
    this.kills.push(signal);
  }

  onData(listener: (data: string) => void): { dispose: () => void } {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  onExit(listener: (event: { exitCode: number }) => void): { dispose: () => void } {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) {
      listener({ exitCode });
    }
  }
}
