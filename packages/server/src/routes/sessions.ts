import { Hono } from 'hono';

import { Session } from '../core/index.js';

import type { PromptInput, ReasoningLevel } from '../core/index.js';
import type { AgentEvent, Api } from '@ank1015/llm-sdk';
import type { Context } from 'hono';

const BASE = '/projects/:projectId/artifacts/:artifactDirId/sessions';

export const sessionRoutes = new Hono();

const REASONING_LEVELS = new Set<ReasoningLevel>(['low', 'medium', 'high', 'xhigh']);

type SessionTurnBody = {
  message?: string;
  skills?: string[];
  api?: string;
  modelId?: string;
  reasoningLevel?: string;
  reasoning?: string;
};

function resolvePromptInput(
  body: SessionTurnBody | undefined
): { error: string } | { input: PromptInput } {
  if (!body?.message) {
    return { error: 'message is required' };
  }

  const api = typeof body.api === 'string' ? body.api.trim() : '';
  const modelId = typeof body.modelId === 'string' ? body.modelId.trim() : '';
  const hasProviderOverride = api.length > 0 || modelId.length > 0;

  if (hasProviderOverride && (api.length === 0 || modelId.length === 0)) {
    return { error: 'api and modelId must be provided together' };
  }

  const rawReasoningLevel =
    typeof body.reasoningLevel === 'string'
      ? body.reasoningLevel
      : typeof body.reasoning === 'string'
        ? body.reasoning
        : undefined;
  const reasoningLevel = rawReasoningLevel?.trim().toLowerCase();

  if (reasoningLevel && !REASONING_LEVELS.has(reasoningLevel as ReasoningLevel)) {
    return { error: 'reasoning must be one of: low, medium, high, xhigh' };
  }

  return {
    input: {
      message: body.message,
      skills: body.skills ?? [],
      ...(hasProviderOverride ? { api: api as Api, modelId } : {}),
      ...(reasoningLevel ? { reasoningLevel: reasoningLevel as ReasoningLevel } : {}),
    },
  };
}

function resolveTurnSettings(
  body: SessionTurnBody | undefined
): { error: string } | { input: Omit<PromptInput, 'message'> } {
  const api = typeof body?.api === 'string' ? body.api.trim() : '';
  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : '';
  const hasProviderOverride = api.length > 0 || modelId.length > 0;

  if (hasProviderOverride && (api.length === 0 || modelId.length === 0)) {
    return { error: 'api and modelId must be provided together' };
  }

  const rawReasoningLevel =
    typeof body?.reasoningLevel === 'string'
      ? body.reasoningLevel
      : typeof body?.reasoning === 'string'
        ? body.reasoning
        : undefined;
  const reasoningLevel = rawReasoningLevel?.trim().toLowerCase();

  if (reasoningLevel && !REASONING_LEVELS.has(reasoningLevel as ReasoningLevel)) {
    return { error: 'reasoning must be one of: low, medium, high, xhigh' };
  }

  return {
    input: {
      ...(body?.skills ? { skills: body.skills } : {}),
      ...(hasProviderOverride ? { api: api as Api, modelId } : {}),
      ...(reasoningLevel ? { reasoningLevel: reasoningLevel as ReasoningLevel } : {}),
    },
  };
}

/** POST /api/.../sessions — Create a new session */
sessionRoutes.post(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const body = await c.req.json<{ name?: string; modelId: string; api: string }>();

  if (!body.modelId || !body.api) {
    return c.json({ error: 'modelId and api are required' }, 400);
  }

  try {
    const session = await Session.create(projectId, artifactDirId, body);
    const metadata = await session.getMetadata();
    return c.json(metadata, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create session';
    return c.json({ error: message }, 500);
  }
});

/** GET /api/.../sessions — List sessions */
sessionRoutes.get(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const sessions = await Session.list(projectId, artifactDirId);
    return c.json(sessions);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list sessions';
    return c.json({ error: message }, 500);
  }
});

/** GET /api/.../sessions/:sessionId — Get session metadata */
sessionRoutes.get(`${BASE}/:sessionId`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const metadata = await session.getMetadata();
    return c.json(metadata);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }
});

/** GET /api/.../sessions/:sessionId/messages — Get message history (as MessageNode[]) */
sessionRoutes.get(`${BASE}/:sessionId/messages`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const nodes = await session.getHistoryNodes();
    return c.json(nodes);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }
});

/** POST /api/.../sessions/:sessionId/prompt — Send a message (non-streaming) */
sessionRoutes.post(`${BASE}/:sessionId/prompt`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const body = await c.req.json<SessionTurnBody>().catch(() => undefined);
  const resolvedPromptInput = resolvePromptInput(body);
  if ('error' in resolvedPromptInput) {
    return c.json({ error: resolvedPromptInput.error }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const newMessages = await session.prompt(resolvedPromptInput.input);
    return c.json(newMessages);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to prompt session';
    return c.json({ error: message }, 500);
  }
});

/** DELETE /api/.../sessions/:sessionId — Delete a session */
sessionRoutes.delete(`${BASE}/:sessionId`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    await Session.delete(projectId, artifactDirId, sessionId);
    return c.json({ ok: true, sessionId, deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to delete session';
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// Session Naming
// ---------------------------------------------------------------------------

/** POST /api/.../sessions/:sessionId/generate-name — Auto-generate session name via LLM */
sessionRoutes.post(`${BASE}/:sessionId/generate-name`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const body = await c.req.json<{ query: string }>().catch(() => undefined);

  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return c.json({ error: 'query is required' }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const sessionName = await session.generateName(query);
    return c.json({ ok: true, sessionId, sessionName });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate name';
    return c.json({ error: message }, 500);
  }
});

/** PATCH /api/.../sessions/:sessionId/name — Manually update session name */
sessionRoutes.patch(`${BASE}/:sessionId/name`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const body = await c.req.json<{ name: string }>().catch(() => undefined);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return c.json({ error: 'name is required and must be non-empty' }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    await session.updateName(name);
    return c.json({ ok: true, sessionId, sessionName: name });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update session name';
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// SSE Streaming
// ---------------------------------------------------------------------------

function toSseChunk(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function streamSessionRun(
  c: Context,
  sessionId: string,
  run: (options: { onEvent: (event: AgentEvent) => void; signal?: AbortSignal }) => Promise<{
    length: number;
  }>
) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(toSseChunk(event, data));
        } catch {
          closed = true;
        }
      };

      const close = (): void => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      void (async (): Promise<void> => {
        send('ready', { ok: true, sessionId });

        try {
          const newMessages = await run({
            onEvent: (event) => {
              send('agent_event', event);
            },
            signal: c.req.raw.signal,
          });

          send('done', {
            ok: true,
            sessionId,
            messageCount: newMessages.length,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Stream failed';
          send('error', { ok: false, code: 'STREAM_FAILED', message });
        } finally {
          close();
        }
      })();
    },
  });

  c.header('Content-Type', 'text/event-stream; charset=utf-8');
  c.header('Cache-Control', 'no-cache, no-transform');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return c.body(stream);
}

/** POST /api/.../sessions/:sessionId/stream — Stream a conversation turn via SSE */
sessionRoutes.post(`${BASE}/:sessionId/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const body = await c.req.json<SessionTurnBody>().catch(() => undefined);
  const resolvedPromptInput = resolvePromptInput(body);
  if ('error' in resolvedPromptInput) {
    return c.json({ error: resolvedPromptInput.error }, 400);
  }

  let session: Session;
  try {
    session = await Session.getById(projectId, artifactDirId, sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }

  return streamSessionRun(c, sessionId, async (options) => {
    const newMessages = await session.streamPrompt(resolvedPromptInput.input, options);
    return { length: newMessages.length };
  });
});

/** POST /api/.../sessions/:sessionId/messages/:nodeId/retry/stream — Retry from a user message */
sessionRoutes.post(`${BASE}/:sessionId/messages/:nodeId/retry/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId, nodeId } = c.req.param();
  const body = await c.req.json<SessionTurnBody>().catch(() => undefined);
  const resolvedTurnSettings = resolveTurnSettings(body);
  if ('error' in resolvedTurnSettings) {
    return c.json({ error: resolvedTurnSettings.error }, 400);
  }

  let session: Session;
  try {
    session = await Session.getById(projectId, artifactDirId, sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }

  return streamSessionRun(c, sessionId, async (options) => {
    const newMessages = await session.streamRetryFromUserMessage(
      nodeId,
      resolvedTurnSettings.input,
      options
    );
    return { length: newMessages.length };
  });
});

/** POST /api/.../sessions/:sessionId/messages/:nodeId/edit/stream — Edit from a user message */
sessionRoutes.post(`${BASE}/:sessionId/messages/:nodeId/edit/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId, nodeId } = c.req.param();
  const body = await c.req.json<SessionTurnBody>().catch(() => undefined);
  const resolvedPromptInput = resolvePromptInput(body);
  if ('error' in resolvedPromptInput) {
    return c.json({ error: resolvedPromptInput.error }, 400);
  }

  let session: Session;
  try {
    session = await Session.getById(projectId, artifactDirId, sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }

  return streamSessionRun(c, sessionId, async (options) => {
    const newMessages = await session.streamEditFromUserMessage(
      nodeId,
      resolvedPromptInput.input,
      options
    );
    return { length: newMessages.length };
  });
});
