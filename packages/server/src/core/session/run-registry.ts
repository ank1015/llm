import { randomUUID } from 'node:crypto';

import type { AgentEvent } from '@ank1015/llm-sdk';
import type { SessionMessageNode as MessageNode } from '../../types/index.js';

export type SessionRunMode = 'prompt' | 'retry' | 'edit';
export type SessionRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type LiveRunSummary = {
  runId: string;
  mode: SessionRunMode;
  status: SessionRunStatus;
  startedAt: string;
  finishedAt?: string;
};

export type ReplayableRunEvent =
  | {
      event: 'agent_event';
      seq: number;
      data: {
        seq: number;
        event: AgentEvent;
      };
    }
  | {
      event: 'node_persisted';
      seq: number;
      data: {
        seq: number;
        node: MessageNode;
      };
    }
  | {
      event: 'done';
      seq: number;
      data: {
        ok: true;
        sessionId: string;
        runId: string;
        status: 'completed' | 'cancelled';
        messageCount: number;
      };
    }
  | {
      event: 'error';
      seq: number;
      data: {
        ok: false;
        sessionId: string;
        runId: string;
        seq: number;
        code: string;
        message: string;
      };
    };

type RunSubscriber = {
  send: (entry: ReplayableRunEvent) => void;
  close: () => void;
};

type StartRunOptions = {
  sessionKey: string;
  sessionId: string;
  mode: SessionRunMode;
  execute: (options: {
    signal: AbortSignal;
    onEvent: (event: AgentEvent) => void;
    onNodePersisted: (node: MessageNode) => void;
  }) => Promise<{ messageCount: number }>;
};

const TERMINAL_TTL_MS = 2 * 60 * 1000;

class SessionRun {
  readonly runId = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly abortController = new AbortController();

  private seq = 0;
  private finishedAt?: string;
  private status: SessionRunStatus = 'running';
  private cancelRequested = false;
  private readonly replayBuffer: ReplayableRunEvent[] = [];
  private readonly subscribers = new Set<RunSubscriber>();
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sessionKey: string,
    private readonly sessionId: string,
    private readonly mode: SessionRunMode,
    private readonly onExpired: (sessionKey: string, runId: string) => void
  ) {}

  get summary(): LiveRunSummary {
    return {
      runId: this.runId,
      mode: this.mode,
      status: this.status,
      startedAt: this.startedAt,
      ...(this.finishedAt ? { finishedAt: this.finishedAt } : {}),
    };
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  currentSeq(): number {
    return this.seq;
  }

  getReplayEvents(afterSeq: number): ReplayableRunEvent[] {
    return this.replayBuffer.filter((entry) => entry.seq > afterSeq);
  }

  subscribe(subscriber: RunSubscriber): () => void {
    if (!this.isRunning()) {
      return () => undefined;
    }

    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  cancel(): boolean {
    if (!this.isRunning()) {
      return false;
    }

    this.cancelRequested = true;
    this.abortController.abort();
    return true;
  }

  emitAgentEvent(event: AgentEvent): void {
    if (!this.isRunning()) {
      return;
    }

    this.broadcast({
      event: 'agent_event',
      seq: this.nextSeq(),
      data: {
        seq: this.seq,
        event,
      },
    });
  }

  emitNodePersisted(node: MessageNode): void {
    if (!this.isRunning()) {
      return;
    }

    this.broadcast({
      event: 'node_persisted',
      seq: this.nextSeq(),
      data: {
        seq: this.seq,
        node,
      },
    });
  }

  complete(messageCount: number): void {
    if (!this.isRunning()) {
      return;
    }

    const status =
      this.cancelRequested || this.abortController.signal.aborted ? 'cancelled' : 'completed';
    this.status = status;
    this.finishedAt = new Date().toISOString();
    this.broadcastTerminal({
      event: 'done',
      seq: this.nextSeq(),
      data: {
        ok: true,
        sessionId: this.sessionId,
        runId: this.runId,
        status,
        messageCount,
      },
    });
  }

  fail(error: unknown): void {
    if (!this.isRunning()) {
      return;
    }

    if (this.cancelRequested || this.abortController.signal.aborted) {
      this.complete(0);
      return;
    }

    this.status = 'failed';
    this.finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Stream failed';
    this.broadcastTerminal({
      event: 'error',
      seq: this.nextSeq(),
      data: {
        ok: false,
        sessionId: this.sessionId,
        runId: this.runId,
        seq: this.seq,
        code: 'STREAM_FAILED',
        message,
      },
    });
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const subscriber of this.subscribers) {
      subscriber.close();
    }
    this.subscribers.clear();
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private broadcast(entry: ReplayableRunEvent): void {
    this.replayBuffer.push(entry);
    for (const subscriber of this.subscribers) {
      subscriber.send(entry);
    }
  }

  private broadcastTerminal(entry: ReplayableRunEvent): void {
    this.replayBuffer.push(entry);
    for (const subscriber of this.subscribers) {
      subscriber.send(entry);
      subscriber.close();
    }
    this.subscribers.clear();
    this.scheduleCleanup();
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }

    this.cleanupTimer = setTimeout(() => {
      this.dispose();
      this.onExpired(this.sessionKey, this.runId);
    }, TERMINAL_TTL_MS);
  }
}

class SessionRunRegistry {
  private readonly runsBySessionKey = new Map<string, SessionRun>();

  startRun(options: StartRunOptions): { status: 'started' | 'already_running'; run: SessionRun } {
    const current = this.runsBySessionKey.get(options.sessionKey);
    if (current?.isRunning()) {
      return { status: 'already_running', run: current };
    }

    current?.dispose();

    const run = new SessionRun(
      options.sessionKey,
      options.sessionId,
      options.mode,
      (sessionKey, runId) => {
        const active = this.runsBySessionKey.get(sessionKey);
        if (active?.runId === runId) {
          this.runsBySessionKey.delete(sessionKey);
        }
      }
    );
    this.runsBySessionKey.set(options.sessionKey, run);

    void options
      .execute({
        signal: run.abortController.signal,
        onEvent: (event) => run.emitAgentEvent(event),
        onNodePersisted: (node) => run.emitNodePersisted(node),
      })
      .then((result) => {
        run.complete(result.messageCount);
      })
      .catch((error) => {
        run.fail(error);
      });

    return { status: 'started', run };
  }

  getRun(sessionKey: string, runId: string): SessionRun | null {
    const run = this.runsBySessionKey.get(sessionKey);
    if (!run || run.runId !== runId) {
      return null;
    }

    return run;
  }

  getLiveRunSummary(sessionKey: string): LiveRunSummary | null {
    return this.runsBySessionKey.get(sessionKey)?.summary ?? null;
  }

  hasActiveRunForArtifact(projectId: string, artifactDirId: string): boolean {
    const artifactPrefix = `${projectId}:${artifactDirId}:`;

    for (const [sessionKey, run] of this.runsBySessionKey.entries()) {
      if (sessionKey.startsWith(artifactPrefix) && run.isRunning()) {
        return true;
      }
    }

    return false;
  }

  cancelRun(sessionKey: string, runId: string): boolean {
    const run = this.getRun(sessionKey, runId);
    if (!run) {
      return false;
    }

    return run.cancel();
  }

  reset(): void {
    for (const run of this.runsBySessionKey.values()) {
      run.dispose();
    }
    this.runsBySessionKey.clear();
  }
}

export const sessionRunRegistry = new SessionRunRegistry();

export function resetSessionRunRegistry(): void {
  sessionRunRegistry.reset();
}
