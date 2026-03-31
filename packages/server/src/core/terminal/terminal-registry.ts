import { randomUUID } from 'node:crypto';

import { spawn as spawnPty } from 'node-pty';

import { createPythonPtyFactory } from './python-pty.js';
import { getTerminalShellLaunchConfig } from './shell.js';

import type { CreateTerminalOptions, TerminalMetadata, TerminalSummary } from '../../types/index.js';
import type {
  TerminalErrorMessage,
  TerminalExitMessage,
  TerminalMetadataDto,
  TerminalOutputMessage,
  TerminalReadyMessage,
  TerminalServerMessage,
  TerminalSummaryDto,
} from '../../contracts/index.js';
import type { IPty } from 'node-pty';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;
const MAX_REPLAY_BYTES = 1_000_000;
const EXIT_RETENTION_MS = 30 * 60 * 1000;
const DETACHED_IDLE_TTL_MS = 12 * 60 * 60 * 1000;
const FORCE_KILL_TIMEOUT_MS = 1_000;
const SOCKET_TAKEOVER_CLOSE_CODE = 4101;
const SOCKET_EXIT_CLOSE_CODE = 1000;
const SOCKET_DELETE_CLOSE_CODE = 1001;

type TerminalReplayMessage = TerminalOutputMessage | TerminalExitMessage | TerminalErrorMessage;

type TerminalSubscriber = {
  send: (message: TerminalServerMessage) => void;
  close: (code?: number, reason?: string) => void;
};

type Disposable = {
  dispose: () => void;
};

type TerminalPtyExitEvent = {
  exitCode: number;
  signal?: number;
};

export interface TerminalPtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): Disposable;
  onExit(listener: (event: TerminalPtyExitEvent) => void): Disposable;
}

export type TerminalPtyFactory = (config: {
  shell: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
}) => TerminalPtyProcess;

function createNodePtyFactory(): TerminalPtyFactory {
  const fallbackFactory = createPythonPtyFactory();

  return ({ shell, args, cwd, env, cols, rows }) => {
    try {
      return spawnPty(shell, args, {
        name: env['TERM'] ?? 'xterm-256color',
        cwd,
        env,
        cols,
        rows,
      }) as unknown as TerminalPtyProcess;
    } catch (error) {
      if (
        fallbackFactory &&
        error instanceof Error &&
        error.message.toLowerCase().includes('posix_spawn')
      ) {
        return fallbackFactory({ shell, args, cwd, env, cols, rows });
      }

      throw error;
    }
  };
}

function artifactKey(projectId: string, artifactId: string): string {
  return `${projectId}:${artifactId}`;
}

function terminalKey(projectId: string, artifactId: string, terminalId: string): string {
  return `${projectId}:${artifactId}:${terminalId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDimension(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(1000, Math.floor(value as number)));
}

function summarizeMetadata(metadata: TerminalMetadata): TerminalSummary {
  const { cwdAtLaunch: _cwdAtLaunch, shell: _shell, ...summary } = metadata;
  return summary;
}

class ArtifactTerminal {
  private readonly createdAt = nowIso();
  private lastActiveAt = this.createdAt;
  private readonly replayBuffer: TerminalReplayMessage[] = [];
  private replayBytes = 0;
  private seq = 0;
  private status: TerminalSummary['status'] = 'running';
  private exitCode: number | null = null;
  private signal: string | null = null;
  private exitedAt: string | null = null;
  private subscriber: TerminalSubscriber | null = null;
  private exitCleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private detachedIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private forceKillTimer: ReturnType<typeof setTimeout> | null = null;
  private removed = false;
  private readonly disposables: Disposable[];

  constructor(
    private readonly pty: TerminalPtyProcess,
    readonly id: string,
    readonly projectId: string,
    readonly artifactId: string,
    readonly title: string,
    readonly cwdAtLaunch: string,
    readonly shell: string,
    private cols: number,
    private rows: number,
    private readonly onRetainedTerminalExpired: (terminalId: string) => void
  ) {
    this.disposables = [
      this.pty.onData((data) => {
        this.handleOutput(data);
      }),
      this.pty.onExit((event) => {
        this.handleExit(event);
      }),
    ];

    this.scheduleDetachedIdleTimer();
  }

  toMetadata(): TerminalMetadata {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      projectId: this.projectId,
      artifactId: this.artifactId,
      cwdAtLaunch: this.cwdAtLaunch,
      shell: this.shell,
      cols: this.cols,
      rows: this.rows,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      exitCode: this.exitCode,
      signal: this.signal,
      exitedAt: this.exitedAt,
    };
  }

  toSummary(): TerminalSummary {
    return summarizeMetadata(this.toMetadata());
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  isExited(): boolean {
    return this.status === 'exited';
  }

  markRemoved(): void {
    this.removed = true;
    this.clearExitCleanupTimer();
    this.clearDetachedIdleTimer();
    this.closeSubscriber(SOCKET_DELETE_CLOSE_CODE, 'Terminal deleted');

    if (this.isRunning()) {
      this.requestStop();
      return;
    }

    this.dispose();
  }

  writeInput(data: string): void {
    if (!this.isRunning()) {
      throw new Error(`Terminal "${this.id}" is not running`);
    }

    this.touch();
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = normalizeDimension(cols, DEFAULT_COLS);
    this.rows = normalizeDimension(rows, DEFAULT_ROWS);

    if (!this.isRunning()) {
      return;
    }

    this.pty.resize(this.cols, this.rows);
  }

  attach(subscriber: TerminalSubscriber, afterSeq: number): () => void {
    this.replaceSubscriber(subscriber);
    this.clearDetachedIdleTimer();

    this.sendToCurrentSubscriber({
      type: 'ready',
      terminal: this.toMetadata(),
    } satisfies TerminalReadyMessage);

    for (const message of this.replayBuffer) {
      if (message.seq > afterSeq) {
        this.sendToCurrentSubscriber(message);
      }
    }

    if (this.isExited()) {
      queueMicrotask(() => {
        if (this.subscriber === subscriber) {
          this.closeSubscriber(SOCKET_EXIT_CLOSE_CODE, 'Terminal exited');
        }
      });
    }

    return () => {
      if (this.subscriber !== subscriber) {
        return;
      }

      this.subscriber = null;
      if (this.isRunning()) {
        this.scheduleDetachedIdleTimer();
      }
    };
  }

  private replaceSubscriber(subscriber: TerminalSubscriber): void {
    if (this.subscriber && this.subscriber !== subscriber) {
      this.subscriber.close(
        SOCKET_TAKEOVER_CLOSE_CODE,
        'Terminal reattached from another connection'
      );
    }

    this.subscriber = subscriber;
  }

  private handleOutput(data: string): void {
    if (this.removed || !this.isRunning() || data.length === 0) {
      return;
    }

    this.touch();
    const message: TerminalOutputMessage = {
      type: 'output',
      seq: this.nextSeq(),
      data,
    };
    this.pushReplayMessage(message);
    this.sendToCurrentSubscriber(message);
  }

  private handleExit(event: TerminalPtyExitEvent): void {
    this.clearForceKillTimer();

    if (this.removed) {
      this.dispose();
      return;
    }

    if (this.isExited()) {
      return;
    }

    this.status = 'exited';
    this.exitCode = Number.isFinite(event.exitCode) ? event.exitCode : null;
    this.signal = event.signal === undefined || event.signal === 0 ? null : String(event.signal);
    this.exitedAt = nowIso();

    const exitMessage: TerminalExitMessage = {
      type: 'exit',
      seq: this.nextSeq(),
      exitCode: this.exitCode,
      signal: this.signal,
      exitedAt: this.exitedAt,
    };
    this.pushReplayMessage(exitMessage);
    this.sendToCurrentSubscriber(exitMessage);
    this.closeSubscriber(SOCKET_EXIT_CLOSE_CODE, 'Terminal exited');
    this.scheduleExitCleanupTimer();
  }

  private requestStop(): void {
    this.clearForceKillTimer();

    try {
      this.pty.kill(process.platform === 'win32' ? undefined : 'SIGHUP');
    } catch {
      // Ignore; fall through to forced termination below.
    }

    this.forceKillTimer = setTimeout(() => {
      try {
        this.pty.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
      } catch {
        this.dispose();
      }
    }, FORCE_KILL_TIMEOUT_MS);
  }

  private sendToCurrentSubscriber(message: TerminalServerMessage): void {
    if (!this.subscriber) {
      return;
    }

    try {
      this.subscriber.send(message);
    } catch {
      this.closeSubscriber(1011, 'Terminal socket send failed');
    }
  }

  private closeSubscriber(code?: number, reason?: string): void {
    const subscriber = this.subscriber;
    this.subscriber = null;

    if (!subscriber) {
      return;
    }

    try {
      subscriber.close(code, reason);
    } catch {
      // Best-effort close.
    }

    if (this.isRunning() && !this.removed) {
      this.scheduleDetachedIdleTimer();
    }
  }

  private pushReplayMessage(message: TerminalReplayMessage): void {
    this.replayBuffer.push(message);
    this.replayBytes += Buffer.byteLength(JSON.stringify(message), 'utf8');

    while (this.replayBytes > MAX_REPLAY_BYTES && this.replayBuffer.length > 1) {
      const removedMessage = this.replayBuffer.shift();
      if (!removedMessage) {
        break;
      }
      this.replayBytes -= Buffer.byteLength(JSON.stringify(removedMessage), 'utf8');
    }
  }

  private touch(): void {
    this.lastActiveAt = nowIso();
    if (!this.subscriber) {
      this.scheduleDetachedIdleTimer();
    }
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private scheduleExitCleanupTimer(): void {
    this.clearExitCleanupTimer();
    this.exitCleanupTimer = setTimeout(() => {
      this.dispose();
      this.onRetainedTerminalExpired(this.id);
    }, EXIT_RETENTION_MS);
  }

  private scheduleDetachedIdleTimer(): void {
    if (!this.isRunning() || this.subscriber || this.removed) {
      return;
    }

    this.clearDetachedIdleTimer();
    const lastActiveTime = new Date(this.lastActiveAt).getTime();
    const timeout = Math.max(0, DETACHED_IDLE_TTL_MS - (Date.now() - lastActiveTime));

    this.detachedIdleTimer = setTimeout(() => {
      if (this.isRunning() && !this.subscriber && !this.removed) {
        this.requestStop();
      }
    }, timeout);
  }

  private clearExitCleanupTimer(): void {
    if (this.exitCleanupTimer) {
      clearTimeout(this.exitCleanupTimer);
      this.exitCleanupTimer = null;
    }
  }

  private clearDetachedIdleTimer(): void {
    if (this.detachedIdleTimer) {
      clearTimeout(this.detachedIdleTimer);
      this.detachedIdleTimer = null;
    }
  }

  private clearForceKillTimer(): void {
    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = null;
    }
  }

  private dispose(): void {
    this.clearExitCleanupTimer();
    this.clearDetachedIdleTimer();
    this.clearForceKillTimer();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

export class TerminalRegistry {
  private readonly terminals = new Map<string, ArtifactTerminal>();
  private readonly titleCounters = new Map<string, number>();

  constructor(private readonly ptyFactory: TerminalPtyFactory = createNodePtyFactory()) {}

  createTerminal(params: {
    projectId: string;
    artifactId: string;
    cwd: string;
    options?: CreateTerminalOptions;
  }): TerminalMetadata {
    const cols = normalizeDimension(params.options?.cols, DEFAULT_COLS);
    const rows = normalizeDimension(params.options?.rows, DEFAULT_ROWS);
    const launch = getTerminalShellLaunchConfig();
    const id = randomUUID();
    const title = this.nextTitle(params.projectId, params.artifactId);

    const pty = this.ptyFactory({
      shell: launch.shell,
      args: launch.args,
      cwd: params.cwd,
      env: launch.env,
      cols,
      rows,
    });

    const terminal = new ArtifactTerminal(
      pty,
      id,
      params.projectId,
      params.artifactId,
      title,
      params.cwd,
      launch.shell,
      cols,
      rows,
      (expiredTerminalId) => {
        const key = terminalKey(params.projectId, params.artifactId, expiredTerminalId);
        const current = this.terminals.get(key);
        if (current === terminal) {
          this.terminals.delete(key);
        }
      }
    );

    this.terminals.set(terminalKey(params.projectId, params.artifactId, id), terminal);
    return terminal.toMetadata();
  }

  listTerminals(projectId: string, artifactId: string): TerminalSummary[] {
    return Array.from(this.terminals.values())
      .filter((terminal) => terminal.projectId === projectId && terminal.artifactId === artifactId)
      .map((terminal) => terminal.toSummary())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  getTerminal(projectId: string, artifactId: string, terminalId: string): TerminalMetadata | null {
    return this.findTerminal(projectId, artifactId, terminalId)?.toMetadata() ?? null;
  }

  deleteTerminal(projectId: string, artifactId: string, terminalId: string): boolean {
    const key = terminalKey(projectId, artifactId, terminalId);
    const terminal = this.terminals.get(key);
    if (!terminal) {
      return false;
    }

    this.terminals.delete(key);
    terminal.markRemoved();
    return true;
  }

  attachTerminal(
    projectId: string,
    artifactId: string,
    terminalId: string,
    subscriber: TerminalSubscriber,
    afterSeq = 0
  ): (() => void) | null {
    const terminal = this.findTerminal(projectId, artifactId, terminalId);
    if (!terminal) {
      return null;
    }

    return terminal.attach(subscriber, Math.max(0, afterSeq));
  }

  writeInput(projectId: string, artifactId: string, terminalId: string, data: string): void {
    const terminal = this.findTerminal(projectId, artifactId, terminalId);
    if (!terminal) {
      throw new Error(`Terminal "${terminalId}" not found`);
    }

    terminal.writeInput(data);
  }

  resizeTerminal(
    projectId: string,
    artifactId: string,
    terminalId: string,
    cols: number,
    rows: number
  ): void {
    const terminal = this.findTerminal(projectId, artifactId, terminalId);
    if (!terminal) {
      throw new Error(`Terminal "${terminalId}" not found`);
    }

    terminal.resize(cols, rows);
  }

  getRunningTerminalForArtifact(projectId: string, artifactId: string): TerminalSummary | null {
    for (const terminal of this.terminals.values()) {
      if (
        terminal.projectId === projectId &&
        terminal.artifactId === artifactId &&
        terminal.isRunning()
      ) {
        return terminal.toSummary();
      }
    }

    return null;
  }

  getRunningTerminalForProject(projectId: string): TerminalSummary | null {
    for (const terminal of this.terminals.values()) {
      if (terminal.projectId === projectId && terminal.isRunning()) {
        return terminal.toSummary();
      }
    }

    return null;
  }

  dropExitedTerminalsForArtifact(projectId: string, artifactId: string): void {
    for (const [key, terminal] of this.terminals.entries()) {
      if (
        terminal.projectId === projectId &&
        terminal.artifactId === artifactId &&
        terminal.isExited()
      ) {
        this.terminals.delete(key);
        terminal.markRemoved();
      }
    }
  }

  dropExitedTerminalsForProject(projectId: string): void {
    for (const [key, terminal] of this.terminals.entries()) {
      if (terminal.projectId === projectId && terminal.isExited()) {
        this.terminals.delete(key);
        terminal.markRemoved();
      }
    }
  }

  disposeAll(): void {
    for (const terminal of this.terminals.values()) {
      terminal.markRemoved();
    }
    this.terminals.clear();
  }

  private findTerminal(
    projectId: string,
    artifactId: string,
    terminalId: string
  ): ArtifactTerminal | null {
    return this.terminals.get(terminalKey(projectId, artifactId, terminalId)) ?? null;
  }

  private nextTitle(projectId: string, artifactId: string): string {
    const key = artifactKey(projectId, artifactId);
    const next = (this.titleCounters.get(key) ?? 0) + 1;
    this.titleCounters.set(key, next);
    return `Terminal ${next}`;
  }
}

export let terminalRegistry = new TerminalRegistry();

export function resetTerminalRegistry(ptyFactory?: TerminalPtyFactory): void {
  terminalRegistry.disposeAll();
  terminalRegistry = new TerminalRegistry(ptyFactory);
}

export function toTerminalSummaryDto(summary: TerminalSummary): TerminalSummaryDto {
  return summary;
}

export function toTerminalMetadataDto(metadata: TerminalMetadata): TerminalMetadataDto {
  return metadata;
}

export type TestablePtyProcess = TerminalPtyProcess | IPty;
