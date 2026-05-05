import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, resolve as resolvePath } from 'node:path';

import { type Static, Type } from '@sinclair/typebox';
import { spawn as spawnPty } from 'node-pty';

import { resolveToCwd } from './path-utils.js';
import { killProcessTree } from './utils/shell.js';

import type { AgentTool } from '@ank1015/llm-core';
import type { IPty, IPtyForkOptions } from 'node-pty';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

const MIN_YIELD_TIME_MS = 250;
const MIN_EMPTY_YIELD_TIME_MS = 5_000;
const MAX_YIELD_TIME_MS = 30_000;
const DEFAULT_EXEC_YIELD_TIME_MS = 10_000;
const DEFAULT_WRITE_STDIN_YIELD_TIME_MS = 250;
const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;
const OUTPUT_CHARS_PER_TOKEN = 4;
const OPERATION_ABORTED = 'Operation aborted';

const execCommandSchema = Type.Object(
  {
    cmd: Type.String({ description: 'Shell command to execute.' }),
    workdir: Type.Optional(
      Type.String({
        description: 'Optional working directory to run the command in; defaults to the turn cwd.',
      })
    ),
    shell: Type.Optional(
      Type.String({ description: "Shell binary to launch. Defaults to the user's default shell." })
    ),
    tty: Type.Optional(
      Type.Boolean({
        description:
          'Whether to allocate a TTY for the command. Defaults to false (plain pipes); set to true to open a PTY and access TTY process.',
      })
    ),
    yield_time_ms: Type.Optional(
      Type.Number({ description: 'How long to wait (in milliseconds) for output before yielding.' })
    ),
    max_output_tokens: Type.Optional(
      Type.Number({
        description: 'Maximum number of tokens to return. Excess output will be truncated.',
      })
    ),
    login: Type.Optional(
      Type.Boolean({
        description: 'Whether to run the shell with -l/-i semantics. Defaults to true.',
      })
    ),
  },
  { additionalProperties: false }
);

const writeStdinSchema = Type.Object(
  {
    session_id: Type.Number({ description: 'Identifier of the running unified exec session.' }),
    chars: Type.Optional(
      Type.String({ description: 'Bytes to write to stdin (may be empty to poll).' })
    ),
    yield_time_ms: Type.Optional(
      Type.Number({ description: 'How long to wait (in milliseconds) for output before yielding.' })
    ),
    max_output_tokens: Type.Optional(
      Type.Number({
        description: 'Maximum number of tokens to return. Excess output will be truncated.',
      })
    ),
  },
  { additionalProperties: false }
);

export type ExecCommandToolInput = Static<typeof execCommandSchema>;
export type WriteStdinToolInput = Static<typeof writeStdinSchema>;

export interface UnifiedExecToolDetails {
  chunk_id: string;
  wall_time_seconds: number;
  output: string;
  original_token_count: number;
  exit_code?: number;
  session_id?: number;
}

type ShellType = 'zsh' | 'bash' | 'powershell' | 'sh' | 'cmd';

export interface UnifiedExecCommandLine {
  command: string;
  args: string[];
  shellType: ShellType;
}

export type UnifiedExecPtyProcess = Pick<IPty, 'pid' | 'write' | 'kill' | 'onData' | 'onExit'>;

export interface UnifiedExecPipeProcess extends Pick<ChildProcess, 'pid' | 'kill' | 'on'> {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
}

export interface UnifiedExecOperations {
  spawnPipe: (command: string, args: string[], options: SpawnOptions) => UnifiedExecPipeProcess;
  spawnPty: (command: string, args: string[], options: IPtyForkOptions) => UnifiedExecPtyProcess;
}

export interface UnifiedExecManagerOptions {
  operations?: Partial<UnifiedExecOperations>;
  nextSessionId?: () => number;
}

export interface ExecCommandToolOptions {
  manager?: UnifiedExecProcessManager;
}

export interface WriteStdinToolOptions {
  manager?: UnifiedExecProcessManager;
}

const defaultUnifiedExecOperations: UnifiedExecOperations = {
  spawnPipe: (command, args, options) => spawn(command, args, options) as UnifiedExecPipeProcess,
  spawnPty: (command, args, options) => spawnPty(command, args, options),
};

function generateSessionId(): number {
  return (randomBytes(4).readUInt32BE(0) % 99_000) + 1_000;
}

function generateChunkId(): string {
  return randomBytes(3).toString('hex');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function approxTokenCount(text: string): number {
  return Math.ceil(text.length / OUTPUT_CHARS_PER_TOKEN);
}

function resolveMaxOutputTokens(value: number | undefined): number {
  return value ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

function truncateOutput(text: string, maxOutputTokens: number): string {
  const originalTokenCount = approxTokenCount(text);
  if (originalTokenCount <= maxOutputTokens) {
    return text;
  }

  const maxChars = Math.max(0, maxOutputTokens * OUTPUT_CHARS_PER_TOKEN);
  const half = Math.floor(maxChars / 2);
  const head = text.slice(0, half);
  const tail = text.slice(text.length - (maxChars - half));
  return `${head}\n[... output truncated to ${maxOutputTokens} tokens ...]\n${tail}`;
}

function getPathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
}

function buildUnifiedExecEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const pathKey = getPathKey(env);
  env[pathKey] = env[pathKey] ?? '';
  env.NO_COLOR = '1';
  env.TERM = 'dumb';
  env.LANG = 'C.UTF-8';
  env.LC_CTYPE = 'C.UTF-8';
  env.LC_ALL = 'C.UTF-8';
  env.COLORTERM = '';
  env.PAGER = 'cat';
  env.GIT_PAGER = 'cat';
  env.GH_PAGER = 'cat';
  env.CODEX_CI = '1';
  return env;
}

function detectShellType(shellPath: string): ShellType | undefined {
  const name = basename(shellPath)
    .toLowerCase()
    .replace(/\.exe$/u, '');
  if (name === 'zsh' || name === 'bash' || name === 'sh' || name === 'cmd') {
    return name;
  }
  if (name === 'pwsh' || name === 'powershell') {
    return 'powershell';
  }
  return undefined;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

function defaultUserShell(): { path: string; type: ShellType } {
  if (process.platform === 'win32') {
    const comSpec = process.env.ComSpec?.trim();
    if (comSpec) {
      return { path: comSpec, type: 'cmd' };
    }
    return { path: 'powershell.exe', type: 'powershell' };
  }

  const envShell = process.env.SHELL?.trim();
  const envShellType = envShell ? detectShellType(envShell) : undefined;
  if (envShell && envShellType) {
    return { path: envShell, type: envShellType };
  }

  const shellPath =
    process.platform === 'darwin'
      ? firstExisting(['/bin/zsh', '/bin/bash', '/bin/sh'])
      : firstExisting(['/bin/bash', '/bin/zsh', '/bin/sh']);

  if (shellPath) {
    return { path: shellPath, type: detectShellType(shellPath) ?? 'sh' };
  }

  return { path: 'sh', type: 'sh' };
}

export function resolveUnifiedExecCommand(
  cmd: string,
  options?: { shell?: string; login?: boolean }
): UnifiedExecCommandLine {
  const requestedShell = options?.shell?.trim();
  const fallback = defaultUserShell();
  const shell = requestedShell && requestedShell.length > 0 ? requestedShell : fallback.path;
  const shellType = detectShellType(shell) ?? fallback.type;
  const useLoginShell = options?.login ?? true;

  if (shellType === 'zsh' || shellType === 'bash' || shellType === 'sh') {
    return {
      command: shell,
      args: [useLoginShell ? '-lc' : '-c', cmd],
      shellType,
    };
  }

  if (shellType === 'powershell') {
    return {
      command: shell,
      args: [...(useLoginShell ? [] : ['-NoProfile']), '-Command', cmd],
      shellType,
    };
  }

  return {
    command: shell,
    args: ['/c', cmd],
    shellType: 'cmd',
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(OPERATION_ABORTED));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(new Error(OPERATION_ABORTED));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class OutputNotifier {
  private waiters = new Set<() => void>();

  wait(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error(OPERATION_ABORTED));
        return;
      }

      let settled = false;
      const cleanup = (): void => {
        this.waiters.delete(resolveOnce);
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
      };
      const resolveOnce = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(OPERATION_ABORTED));
      };
      const timeout = setTimeout(resolveOnce, ms);

      this.waiters.add(resolveOnce);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  notify(): void {
    const waiters = Array.from(this.waiters);
    this.waiters.clear();
    for (const waiter of waiters) {
      waiter();
    }
  }
}

class ManagedProcess {
  private readonly output: string[] = [];
  private readonly notifier = new OutputNotifier();
  private exitCodeValue: number | undefined;
  private exitedValue = false;

  constructor(
    readonly sessionId: number,
    readonly tty: boolean,
    readonly killFn: () => void,
    readonly writeFn: (data: string) => void
  ) {}

  get exited(): boolean {
    return this.exitedValue;
  }

  get exitCode(): number | undefined {
    return this.exitCodeValue;
  }

  pushOutput(data: string): void {
    this.output.push(data);
    this.notifier.notify();
  }

  signalExit(exitCode: number | undefined): void {
    this.exitedValue = true;
    this.exitCodeValue = exitCode;
    this.notifier.notify();
  }

  drainOutput(): string {
    const text = this.output.join('');
    this.output.length = 0;
    return text;
  }

  async waitForOutput(deadline: number, signal?: AbortSignal): Promise<string> {
    let collected = '';

    while (Date.now() < deadline) {
      collected += this.drainOutput();
      if (this.exited) {
        break;
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        break;
      }

      await this.notifier.wait(remaining, signal);
    }

    collected += this.drainOutput();
    return collected;
  }

  write(data: string): void {
    this.writeFn(data);
  }

  kill(): void {
    this.killFn();
  }
}

interface UnifiedExecResponse {
  chunkId: string;
  wallTimeSeconds: number;
  output: string;
  originalTokenCount: number;
  exitCode?: number;
  sessionId?: number;
}

export class UnifiedExecProcessManager {
  private readonly operations: UnifiedExecOperations;
  private readonly nextSessionId: () => number;
  private readonly processes = new Map<number, ManagedProcess>();

  constructor(options?: UnifiedExecManagerOptions) {
    this.operations = {
      ...defaultUnifiedExecOperations,
      ...options?.operations,
    };
    this.nextSessionId = options?.nextSessionId ?? generateSessionId;
  }

  async execCommand(
    params: ExecCommandToolInput,
    cwd: string,
    signal?: AbortSignal
  ): Promise<UnifiedExecResponse> {
    if (signal?.aborted) {
      throw new Error(OPERATION_ABORTED);
    }

    const sessionId = this.allocateSessionId();
    const workdir = resolveToCwd(params.workdir?.trim() || '.', cwd);
    const commandOptions: { shell?: string; login?: boolean } = {};
    if (params.shell !== undefined) commandOptions.shell = params.shell;
    if (params.login !== undefined) commandOptions.login = params.login;
    const commandLine = resolveUnifiedExecCommand(params.cmd, commandOptions);
    const tty = params.tty ?? false;
    const process = tty
      ? this.spawnPtyProcess(sessionId, commandLine, workdir)
      : this.spawnPipeProcess(sessionId, commandLine, workdir);

    this.processes.set(sessionId, process);
    const abortHandler = (): void => {
      process.kill();
      this.processes.delete(sessionId);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      const yieldTimeMs = clamp(
        params.yield_time_ms ?? DEFAULT_EXEC_YIELD_TIME_MS,
        MIN_YIELD_TIME_MS,
        MAX_YIELD_TIME_MS
      );
      const start = Date.now();
      const rawOutput = await process.waitForOutput(start + yieldTimeMs, signal);
      const wallTimeSeconds = (Date.now() - start) / 1000;
      const response = this.formatResponse(
        process,
        rawOutput,
        wallTimeSeconds,
        params.max_output_tokens
      );

      if (process.exited) {
        this.processes.delete(sessionId);
      }

      return response;
    } finally {
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  async writeStdin(
    params: WriteStdinToolInput,
    signal?: AbortSignal
  ): Promise<UnifiedExecResponse> {
    const sessionId = Math.trunc(params.session_id);
    const process = this.processes.get(sessionId);
    if (!process) {
      throw new Error(`write_stdin failed: Unknown process id ${sessionId}`);
    }

    const abortHandler = (): void => {
      process.kill();
      this.processes.delete(sessionId);
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      const input = params.chars ?? '';
      if (input.length > 0) {
        if (!process.tty) {
          throw new Error(
            'write_stdin failed: stdin is closed for this session; rerun exec_command with tty=true to keep stdin open'
          );
        }
        process.write(input);
        await delay(100, signal);
      }

      const requestedYieldTimeMs = params.yield_time_ms ?? DEFAULT_WRITE_STDIN_YIELD_TIME_MS;
      const yieldTimeMs =
        input.length === 0
          ? clamp(
              Math.max(requestedYieldTimeMs, MIN_EMPTY_YIELD_TIME_MS),
              MIN_EMPTY_YIELD_TIME_MS,
              MAX_YIELD_TIME_MS
            )
          : Math.min(Math.max(requestedYieldTimeMs, MIN_YIELD_TIME_MS), MAX_YIELD_TIME_MS);
      const start = Date.now();
      const rawOutput = await process.waitForOutput(start + yieldTimeMs, signal);
      const wallTimeSeconds = (Date.now() - start) / 1000;
      const response = this.formatResponse(
        process,
        rawOutput,
        wallTimeSeconds,
        params.max_output_tokens
      );

      if (process.exited) {
        this.processes.delete(sessionId);
      }

      return response;
    } finally {
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  terminateAll(): void {
    for (const process of this.processes.values()) {
      process.kill();
    }
    this.processes.clear();
  }

  hasSession(sessionId: number): boolean {
    return this.processes.has(sessionId);
  }

  private allocateSessionId(): number {
    let sessionId = this.nextSessionId();
    while (this.processes.has(sessionId)) {
      sessionId = this.nextSessionId();
    }
    return sessionId;
  }

  private spawnPipeProcess(
    sessionId: number,
    commandLine: UnifiedExecCommandLine,
    cwd: string
  ): ManagedProcess {
    const child = this.operations.spawnPipe(commandLine.command, commandLine.args, {
      cwd,
      detached: true,
      env: buildUnifiedExecEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const managed = new ManagedProcess(
      sessionId,
      false,
      () => {
        if (child.pid) {
          killProcessTree(child.pid);
        } else {
          child.kill();
        }
      },
      () => {
        throw new Error(
          'stdin is closed for this session; rerun exec_command with tty=true to keep stdin open'
        );
      }
    );

    child.stdout.on('data', (data: Buffer | string) => managed.pushOutput(data.toString()));
    child.stderr.on('data', (data: Buffer | string) => managed.pushOutput(data.toString()));
    child.on('close', (code) => managed.signalExit(code ?? undefined));
    child.on('error', (error) => {
      managed.pushOutput(error.message);
      managed.signalExit(undefined);
    });

    return managed;
  }

  private spawnPtyProcess(
    sessionId: number,
    commandLine: UnifiedExecCommandLine,
    cwd: string
  ): ManagedProcess {
    const pty = this.operations.spawnPty(commandLine.command, commandLine.args, {
      name: 'xterm-256color',
      cwd,
      env: buildUnifiedExecEnv(),
      cols: 120,
      rows: 30,
    });
    const managed = new ManagedProcess(
      sessionId,
      true,
      () => pty.kill(),
      (data) => pty.write(data)
    );

    pty.onData((data: string) => managed.pushOutput(data));
    pty.onExit((event: { exitCode: number }) => managed.signalExit(event.exitCode));

    return managed;
  }

  private formatResponse(
    process: ManagedProcess,
    rawOutput: string,
    wallTimeSeconds: number,
    maxOutputTokens: number | undefined
  ): UnifiedExecResponse {
    const originalTokenCount = approxTokenCount(rawOutput);
    const output = truncateOutput(rawOutput, resolveMaxOutputTokens(maxOutputTokens));
    const response: UnifiedExecResponse = {
      chunkId: generateChunkId(),
      wallTimeSeconds,
      output,
      originalTokenCount,
    };

    if (process.exited) {
      response.exitCode = process.exitCode ?? -1;
    } else {
      response.sessionId = process.sessionId;
    }

    return response;
  }
}

function responseToDetails(response: UnifiedExecResponse): UnifiedExecToolDetails {
  const details: UnifiedExecToolDetails = {
    chunk_id: response.chunkId,
    wall_time_seconds: response.wallTimeSeconds,
    output: response.output,
    original_token_count: response.originalTokenCount,
  };
  if (response.exitCode !== undefined) details.exit_code = response.exitCode;
  if (response.sessionId !== undefined) details.session_id = response.sessionId;
  return details;
}

function responseToText(response: UnifiedExecResponse): string {
  const sections = [
    `Chunk ID: ${response.chunkId}`,
    `Wall time: ${response.wallTimeSeconds.toFixed(4)} seconds`,
  ];

  if (response.exitCode !== undefined) {
    sections.push(`Process exited with code ${response.exitCode}`);
  }

  if (response.sessionId !== undefined) {
    sections.push(`Process running with session ID ${response.sessionId}`);
  }

  sections.push(`Original token count: ${response.originalTokenCount}`);
  sections.push('Output:');
  sections.push(response.output);
  return sections.join('\n');
}

export function createUnifiedExecProcessManager(
  options?: UnifiedExecManagerOptions
): UnifiedExecProcessManager {
  return new UnifiedExecProcessManager(options);
}

const defaultUnifiedExecManager = createUnifiedExecProcessManager();

export function createExecCommandTool(
  cwd: string,
  options?: ExecCommandToolOptions
): AgentTool<typeof execCommandSchema, UnifiedExecToolDetails> {
  const manager = options?.manager ?? defaultUnifiedExecManager;

  return {
    name: 'exec_command',
    description:
      'Runs a command in a PTY, returning output or a session ID for ongoing interaction.',
    parameters: execCommandSchema,
    strict: false,
    execute: async ({ params, signal }) => {
      const response = await manager.execCommand(params, resolvePath(cwd), signal);
      return {
        content: [{ type: 'text', content: responseToText(response) }],
        details: responseToDetails(response),
      };
    },
  };
}

export function createWriteStdinTool(
  options?: WriteStdinToolOptions
): AgentTool<typeof writeStdinSchema, UnifiedExecToolDetails> {
  const manager = options?.manager ?? defaultUnifiedExecManager;

  return {
    name: 'write_stdin',
    description: 'Writes characters to an existing unified exec session and returns recent output.',
    parameters: writeStdinSchema,
    strict: false,
    execute: async ({ params, signal }) => {
      const response = await manager.writeStdin(params, signal);
      return {
        content: [{ type: 'text', content: responseToText(response) }],
        details: responseToDetails(response),
      };
    },
  };
}

export function createUnifiedExecTools(
  cwd: string,
  options?: UnifiedExecManagerOptions
): {
  execCommandTool: AgentTool<typeof execCommandSchema, UnifiedExecToolDetails>;
  writeStdinTool: AgentTool<typeof writeStdinSchema, UnifiedExecToolDetails>;
  manager: UnifiedExecProcessManager;
} {
  const manager = createUnifiedExecProcessManager(options);
  return {
    execCommandTool: createExecCommandTool(cwd, { manager }),
    writeStdinTool: createWriteStdinTool({ manager }),
    manager,
  };
}

export const execCommandTool = createExecCommandTool(process.cwd());
export const writeStdinTool = createWriteStdinTool();
