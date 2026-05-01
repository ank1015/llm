import { Hono } from 'hono';

import { setupAgentRunRegistry } from '../core/setup-agent/run-registry.js';
import { runSetupAgent } from '../core/setup-agent/setup-agent.js';
import { completeSetup, getSetupStatus } from '../core/setup.js';

import type {
  SetupAgentCancelResponse,
  SetupAgentReadyEventData,
  SetupAgentStartResponse,
  SetupCompleteResult,
  SetupStatus,
} from '../contracts/index.js';
import type { Context } from 'hono';

export const setupRoutes = new Hono();

const HEARTBEAT_INTERVAL_MS = 15_000;

setupRoutes.get('/setup/status', async (c) => {
  return c.json<SetupStatus>(await getSetupStatus());
});

setupRoutes.post('/setup/complete', async (c) => {
  return c.json<SetupCompleteResult>(await completeSetup());
});

setupRoutes.post('/setup/agent/start', async (c) => {
  const status = await getSetupStatus();

  if (status.ready) {
    return c.json({ error: 'Setup requirements are already installed.' }, 409);
  }

  const started = setupAgentRunRegistry.startRun({
    execute: async (options) =>
      runSetupAgent({
        initialStatus: status,
        onEvent: options.onEvent,
        signal: options.signal,
      }),
  });

  if (started.status === 'already_running') {
    return c.json({ error: 'Setup agent is already running.', run: started.run.summary }, 409);
  }

  return c.json<SetupAgentStartResponse>({
    ok: true,
    run: started.run.summary,
  });
});

setupRoutes.get('/setup/agent/runs/:runId/stream', (c) => {
  const run = setupAgentRunRegistry.getRun(c.req.param('runId'));

  if (!run) {
    return c.json({ error: 'Setup agent run not found.' }, 404);
  }

  return streamSetupAgentRun(c, run);
});

setupRoutes.post('/setup/agent/runs/:runId/cancel', (c) => {
  const runId = c.req.param('runId');
  const cancelled = setupAgentRunRegistry.cancelRun(runId);

  if (!cancelled) {
    return c.json({ error: 'Setup agent run not found or not active.' }, 404);
  }

  return c.json<SetupAgentCancelResponse>({
    ok: true,
    runId,
    cancelled: true,
  });
});

function toSseChunk(event: string, data: unknown, id?: number): Uint8Array {
  const payload = `${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function toSseComment(comment: string): Uint8Array {
  return new TextEncoder().encode(`: ${comment}\n\n`);
}

function streamSetupAgentRun(
  c: Context,
  run: NonNullable<ReturnType<typeof setupAgentRunRegistry.getRun>>,
  afterSeq = 0
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = (): void => undefined;
      let lastSentSeq = afterSeq;

      const send = (event: string, data: unknown, id?: number): void => {
        if (closed) return;
        try {
          controller.enqueue(toSseChunk(event, data, id));
        } catch {
          closed = true;
        }
      };

      const sendComment = (comment: string): void => {
        if (closed) return;
        try {
          controller.enqueue(toSseComment(comment));
        } catch {
          closed = true;
        }
      };

      const close = (): void => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The stream may already be closed if the client disconnected first.
        }
      };

      const cleanup = (): void => {
        unsubscribe();
        clearInterval(heartbeat);
        c.req.raw.signal.removeEventListener('abort', handleAbort);
        close();
      };

      const handleAbort = (): void => {
        cleanup();
      };

      const heartbeat = setInterval(() => {
        sendComment('keep-alive');
      }, HEARTBEAT_INTERVAL_MS);

      const sendReplayEntry = (entry: ReturnType<typeof run.getReplayEvents>[number]): void => {
        lastSentSeq = entry.seq;
        send(entry.event, entry.data, entry.seq);
      };

      c.req.raw.signal.addEventListener('abort', handleAbort, { once: true });

      send('ready', {
        ok: true,
        runId: run.summary.runId,
        status: run.summary.status,
      } satisfies SetupAgentReadyEventData);

      for (const entry of run.getReplayEvents(lastSentSeq)) {
        sendReplayEntry(entry);
      }

      if (!run.isRunning()) {
        cleanup();
        return;
      }

      unsubscribe = run.subscribe({
        send: (entry) => {
          if (entry.seq <= lastSentSeq) {
            return;
          }
          sendReplayEntry(entry);
        },
        close: () => {
          cleanup();
        },
      });

      for (const entry of run.getReplayEvents(lastSentSeq)) {
        if (entry.seq <= lastSentSeq) {
          continue;
        }
        sendReplayEntry(entry);
      }

      if (!run.isRunning()) {
        cleanup();
      }
    },
  });

  c.header('Content-Type', 'text/event-stream; charset=utf-8');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return c.body(stream);
}
