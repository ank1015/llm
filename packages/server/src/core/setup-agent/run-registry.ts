import { randomUUID } from 'node:crypto';

import type {
  SetupAgentDoneEventData,
  SetupAgentErrorEventData,
  SetupAgentEventData,
  SetupAgentRunSummary,
} from '../../contracts/index.js';
import type { AgentEvent } from '@ank1015/llm-sdk';

type SetupAgentRunStatus = SetupAgentRunSummary['status'];

export type SetupAgentReplayableRunEvent =
  | {
      event: 'agent_event';
      seq: number;
      data: SetupAgentEventData;
    }
  | {
      event: 'done';
      seq: number;
      data: SetupAgentDoneEventData;
    }
  | {
      event: 'error';
      seq: number;
      data: SetupAgentErrorEventData;
    };

type RunSubscriber = {
  send: (entry: SetupAgentReplayableRunEvent) => void;
  close: () => void;
};

type StartRunOptions = {
  execute: (options: {
    signal: AbortSignal;
    onEvent: (event: AgentEvent) => void;
  }) => Promise<{ ready: boolean }>;
};

const TERMINAL_TTL_MS = 2 * 60 * 1000;

class SetupAgentRun {
  readonly runId = randomUUID();
  readonly startedAt = new Date().toISOString();
  readonly abortController = new AbortController();

  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  private finishedAt?: string;
  private seq = 0;
  private status: SetupAgentRunStatus = 'running';
  private readonly replayBuffer: SetupAgentReplayableRunEvent[] = [];
  private readonly subscribers = new Set<RunSubscriber>();

  constructor(private readonly onExpired: (runId: string) => void) {}

  get summary(): SetupAgentRunSummary {
    return {
      runId: this.runId,
      status: this.status,
      startedAt: this.startedAt,
      ...(this.finishedAt ? { finishedAt: this.finishedAt } : {}),
    };
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  getReplayEvents(afterSeq: number): SetupAgentReplayableRunEvent[] {
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

    this.abortController.abort();
    this.complete(false, 'cancelled');
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

  complete(ready: boolean, status: Extract<SetupAgentRunStatus, 'completed' | 'cancelled'>): void {
    if (!this.isRunning()) {
      return;
    }

    this.status = status;
    this.finishedAt = new Date().toISOString();
    this.broadcastTerminal({
      event: 'done',
      seq: this.nextSeq(),
      data: {
        ok: true,
        runId: this.runId,
        status,
        ready,
      },
    });
  }

  fail(error: unknown): void {
    if (!this.isRunning()) {
      return;
    }

    if (this.abortController.signal.aborted) {
      this.complete(false, 'cancelled');
      return;
    }

    this.status = 'failed';
    this.finishedAt = new Date().toISOString();
    this.broadcastTerminal({
      event: 'error',
      seq: this.nextSeq(),
      data: {
        ok: false,
        runId: this.runId,
        seq: this.seq,
        code: 'SETUP_AGENT_FAILED',
        message: error instanceof Error ? error.message : 'Setup agent failed.',
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

  private broadcast(entry: SetupAgentReplayableRunEvent): void {
    this.replayBuffer.push(entry);
    for (const subscriber of this.subscribers) {
      subscriber.send(entry);
    }
  }

  private broadcastTerminal(entry: SetupAgentReplayableRunEvent): void {
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
      this.onExpired(this.runId);
    }, TERMINAL_TTL_MS);
  }
}

class SetupAgentRunRegistry {
  private currentRun: SetupAgentRun | null = null;

  startRun(options: StartRunOptions): { status: 'started' | 'already_running'; run: SetupAgentRun } {
    if (this.currentRun?.isRunning()) {
      return { status: 'already_running', run: this.currentRun };
    }

    this.currentRun?.dispose();

    const run = new SetupAgentRun((runId) => {
      if (this.currentRun?.summary.runId === runId) {
        this.currentRun = null;
      }
    });
    this.currentRun = run;

    void options
      .execute({
        signal: run.abortController.signal,
        onEvent: (event) => run.emitAgentEvent(event),
      })
      .then((result) => {
        run.complete(result.ready, 'completed');
      })
      .catch((error) => {
        run.fail(error);
      });

    return { status: 'started', run };
  }

  getRun(runId: string): SetupAgentRun | null {
    if (!this.currentRun || this.currentRun.summary.runId !== runId) {
      return null;
    }

    return this.currentRun;
  }

  cancelRun(runId: string): boolean {
    return this.getRun(runId)?.cancel() ?? false;
  }

  reset(): void {
    this.currentRun?.dispose();
    this.currentRun = null;
  }
}

export const setupAgentRunRegistry = new SetupAgentRunRegistry();

export function resetSetupAgentRunRegistry(): void {
  setupAgentRunRegistry.reset();
}
