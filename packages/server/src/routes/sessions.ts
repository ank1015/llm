import {
  AttachSessionRunQuerySchema,
  CreateSessionRequestSchema,
  GenerateSessionNameRequestSchema,
  RenameSessionRequestSchema,
  SessionPromptRequestSchema,
  SessionTurnSettingsRequestSchema,
} from '../contracts/index.js';
import { Hono } from 'hono';

import { Session } from '../core/index.js';
import { sessionRunRegistry } from '../core/session/run-registry.js';
import {
  toLiveRunSummaryDto,
  toSessionMetadataDto,
  toSessionSummaryDto,
  toSessionTreeResponse,
} from '../http/contracts.js';
import { readJsonBody, validateSchema } from '../http/validation.js';

import type {
  AttachSessionRunQuery,
  CancelSessionRunResponse,
  CreateSessionRequest,
  DeleteSessionResponse,
  GenerateSessionNameRequest,
  RenameSessionRequest,
  SessionMessagesResponse,
  SessionMetadataDto,
  SessionNameResponse,
  SessionPromptRequest,
  SessionPromptResponse,
  SessionSummaryDto,
  SessionTreeResponse,
  SessionTurnSettingsRequest,
  StreamConflictResponse,
} from '../contracts/index.js';
import type { AgentEvent } from '@ank1015/llm-sdk';
import type { PromptInput, SessionMessageNode, TurnSettingsInput } from '../types/index.js';
import type { Context } from 'hono';

const BASE = '/projects/:projectId/artifacts/:artifactDirId/sessions';
const HEARTBEAT_INTERVAL_MS = 15_000;
const SESSION_NOT_FOUND_MESSAGE = 'Session not found';
const INVALID_REQUEST_BODY_MESSAGE = 'Invalid request body';
const MODEL_ID_REQUIRED_MESSAGE = 'modelId is required';

export const sessionRoutes = new Hono();

function resolvePromptInput(
  body: SessionPromptRequest | undefined
): { error: string } | { input: PromptInput } {
  const message = body?.message?.trim() ?? '';
  const attachments = body?.attachments ?? [];
  if (message.length === 0 && attachments.length === 0) {
    return { error: 'message or attachments are required' };
  }

  const modelId = body?.modelId as PromptInput['modelId'];
  const reasoningEffort = body?.reasoningEffort as PromptInput['reasoningEffort'];
  const leafNodeId = body?.leafNodeId?.trim() ?? '';

  return {
    input: {
      message,
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(leafNodeId ? { leafNodeId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    },
  };
}

function resolveTurnSettings(
  body: SessionTurnSettingsRequest | undefined
): { error: string } | { input: TurnSettingsInput } {
  const modelId = body?.modelId as TurnSettingsInput['modelId'];
  const reasoningEffort = body?.reasoningEffort as TurnSettingsInput['reasoningEffort'];
  const leafNodeId = body?.leafNodeId?.trim() ?? '';

  return {
    input: {
      ...(leafNodeId ? { leafNodeId } : {}),
      ...(modelId ? { modelId } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    },
  };
}

/** POST /api/.../sessions — Create a new session */
sessionRoutes.post(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      CreateSessionRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = (rawBody ?? {}) as CreateSessionRequest;
  const modelId = body.modelId as PromptInput['modelId'];

  if (!modelId) {
    return c.json({ error: MODEL_ID_REQUIRED_MESSAGE }, 400);
  }

  try {
    const session = await Session.create(projectId, artifactDirId, {
      ...(body.name?.trim() ? { name: body.name.trim() } : {}),
      modelId,
    });
    const metadata = await session.getMetadata();
    return c.json<SessionMetadataDto>(toSessionMetadataDto(metadata), 201);
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
    return c.json<SessionSummaryDto[]>(sessions.map(toSessionSummaryDto));
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
    return c.json<SessionMetadataDto>(toSessionMetadataDto(metadata));
  } catch (e) {
    const message = e instanceof Error ? e.message : SESSION_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/.../sessions/:sessionId/messages — Get message history (as MessageNode[]) */
sessionRoutes.get(`${BASE}/:sessionId/messages`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const nodes = await session.getHistoryNodes();
    return c.json<SessionMessagesResponse>(nodes);
  } catch (e) {
    const message = e instanceof Error ? e.message : SESSION_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

/** GET /api/.../sessions/:sessionId/tree — Get the full message tree for branch navigation */
sessionRoutes.get(`${BASE}/:sessionId/tree`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const tree = await session.getMessageTree();
    const sessionKey = getSessionRunKey(projectId, artifactDirId, sessionId);
    const liveRun = sessionRunRegistry.getLiveRunSummary(sessionKey);
    return c.json<SessionTreeResponse>(toSessionTreeResponse(tree, liveRun));
  } catch (e) {
    const message = e instanceof Error ? e.message : SESSION_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }
});

/** POST /api/.../sessions/:sessionId/prompt — Send a message (non-streaming) */
sessionRoutes.post(`${BASE}/:sessionId/prompt`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      SessionPromptRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = rawBody as SessionPromptRequest | undefined;
  const resolvedPromptInput = resolvePromptInput(body);
  if ('error' in resolvedPromptInput) {
    return c.json({ error: resolvedPromptInput.error }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const newMessages = await session.prompt(resolvedPromptInput.input);
    return c.json<SessionPromptResponse>(newMessages);
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
    return c.json<DeleteSessionResponse>({ ok: true, sessionId, deleted: true });
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
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      GenerateSessionNameRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = rawBody as GenerateSessionNameRequest | undefined;

  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return c.json({ error: 'query is required' }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const sessionName = await session.generateName(query);
    return c.json<SessionNameResponse>({ ok: true, sessionId, sessionName });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate name';
    return c.json({ error: message }, 500);
  }
});

/** PATCH /api/.../sessions/:sessionId/name — Manually update session name */
sessionRoutes.patch(`${BASE}/:sessionId/name`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      RenameSessionRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = rawBody as RenameSessionRequest | undefined;

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return c.json({ error: 'name is required and must be non-empty' }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    await session.updateName(name);
    return c.json<SessionNameResponse>({ ok: true, sessionId, sessionName: name });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update session name';
    return c.json({ error: message }, 500);
  }
});

// ---------------------------------------------------------------------------
// SSE Streaming
// ---------------------------------------------------------------------------

function getSessionRunKey(projectId: string, artifactDirId: string, sessionId: string): string {
  return `${projectId}:${artifactDirId}:${sessionId}`;
}

function toSseChunk(event: string, data: unknown, id?: number): Uint8Array {
  const payload = `${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function toSseComment(comment: string): Uint8Array {
  return new TextEncoder().encode(`: ${comment}\n\n`);
}

function streamAttachedRun(
  c: Context,
  sessionId: string,
  run: NonNullable<ReturnType<typeof sessionRunRegistry.getRun>>,
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

      const sendReplayEntry = (
        entry: ReturnType<
          NonNullable<ReturnType<typeof sessionRunRegistry.getRun>>['getReplayEvents']
        >[number]
      ): void => {
        lastSentSeq = entry.seq;
        send(entry.event, entry.data, entry.seq);
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

      c.req.raw.signal.addEventListener('abort', handleAbort, { once: true });

      send('ready', {
        ok: true,
        sessionId,
        runId: run.summary.runId,
        status: run.summary.status,
      });

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

async function startSessionRun(
  c: Context,
  input: {
    projectId: string;
    artifactDirId: string;
    sessionId: string;
    mode: 'prompt' | 'retry' | 'edit';
    execute: (options: {
      signal: AbortSignal;
      onEvent: (event: AgentEvent) => void;
      onNodePersisted: (node: SessionMessageNode) => void;
    }) => Promise<{ messageCount: number }>;
  }
): Promise<Response> {
  const sessionKey = getSessionRunKey(input.projectId, input.artifactDirId, input.sessionId);
  const started = sessionRunRegistry.startRun({
    sessionKey,
    sessionId: input.sessionId,
    mode: input.mode,
    execute: input.execute,
  });

  if (started.status === 'already_running') {
    return c.json<StreamConflictResponse>(
      {
        error: 'A stream is already running for this session.',
        liveRun: toLiveRunSummaryDto(started.run.summary),
      },
      409
    );
  }

  return streamAttachedRun(c, input.sessionId, started.run);
}

/** POST /api/.../sessions/:sessionId/stream — Stream a conversation turn via SSE */
sessionRoutes.post(`${BASE}/:sessionId/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      SessionPromptRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = rawBody as SessionPromptRequest | undefined;
  const resolvedPromptInput = resolvePromptInput(body);
  if ('error' in resolvedPromptInput) {
    return c.json({ error: resolvedPromptInput.error }, 400);
  }

  let session: Session;
  try {
    session = await Session.getById(projectId, artifactDirId, sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : SESSION_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }

  return startSessionRun(c, {
    projectId,
    artifactDirId,
    sessionId,
    mode: 'prompt',
    execute: async (options) => {
      const newMessages = await session.streamPrompt(resolvedPromptInput.input, options);
      return { messageCount: newMessages.length };
    },
  });
});

/** POST /api/.../sessions/:sessionId/messages/:nodeId/retry/stream — Retry from a user message */
sessionRoutes.post(`${BASE}/:sessionId/messages/:nodeId/retry/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId, nodeId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      SessionTurnSettingsRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = rawBody as SessionTurnSettingsRequest | undefined;
  const resolvedTurnSettings = resolveTurnSettings(body);
  if ('error' in resolvedTurnSettings) {
    return c.json({ error: resolvedTurnSettings.error }, 400);
  }

  let session: Session;
  try {
    session = await Session.getById(projectId, artifactDirId, sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : SESSION_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }

  return startSessionRun(c, {
    projectId,
    artifactDirId,
    sessionId,
    mode: 'retry',
    execute: async (options) => {
      const newMessages = await session.streamRetryFromUserMessage(
        nodeId,
        resolvedTurnSettings.input,
        options
      );
      return { messageCount: newMessages.length };
    },
  });
});

/** POST /api/.../sessions/:sessionId/messages/:nodeId/edit/stream — Edit from a user message */
sessionRoutes.post(`${BASE}/:sessionId/messages/:nodeId/edit/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId, nodeId } = c.req.param();
  const rawBody = await readJsonBody(c);
  if (rawBody !== undefined) {
    const validation = validateSchema(
      c,
      SessionPromptRequestSchema,
      rawBody,
      INVALID_REQUEST_BODY_MESSAGE
    );
    if (!validation.ok) {
      return validation.response;
    }
  }

  const body = rawBody as SessionPromptRequest | undefined;
  if ((body?.attachments?.length ?? 0) > 0) {
    return c.json({ error: 'attachments are not supported when editing a message' }, 400);
  }
  const resolvedTurnSettings = resolveTurnSettings(body);
  if ('error' in resolvedTurnSettings) {
    return c.json({ error: resolvedTurnSettings.error }, 400);
  }
  const message = body?.message?.trim() ?? '';

  let session: Session;
  try {
    session = await Session.getById(projectId, artifactDirId, sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : SESSION_NOT_FOUND_MESSAGE;
    return c.json({ error: message }, 404);
  }

  return startSessionRun(c, {
    projectId,
    artifactDirId,
    sessionId,
    mode: 'edit',
    execute: async (options) => {
      const newMessages = await session.streamEditFromUserMessage(
        nodeId,
        {
          ...resolvedTurnSettings.input,
          message,
        },
        options
      );
      return { messageCount: newMessages.length };
    },
  });
});

/** GET /api/.../sessions/:sessionId/runs/:runId/stream — Reattach to a live session run */
sessionRoutes.get(`${BASE}/:sessionId/runs/:runId/stream`, async (c) => {
  const { projectId, artifactDirId, sessionId, runId } = c.req.param();
  const sessionKey = getSessionRunKey(projectId, artifactDirId, sessionId);
  const queryValidation = validateSchema(
    c,
    AttachSessionRunQuerySchema,
    c.req.query(),
    'Invalid query parameters'
  );
  if (!queryValidation.ok) {
    return queryValidation.response;
  }

  const query = queryValidation.value as AttachSessionRunQuery;
  const afterSeq = Number.parseInt(query.afterSeq ?? '0', 10);
  const safeAfterSeq = Number.isFinite(afterSeq) && afterSeq > 0 ? afterSeq : 0;
  const run = sessionRunRegistry.getRun(sessionKey, runId);

  if (!run) {
    return c.json({ error: 'Run not found' }, 404);
  }

  return streamAttachedRun(c, sessionId, run, safeAfterSeq);
});

/** POST /api/.../sessions/:sessionId/runs/:runId/cancel — Cancel a live session run */
sessionRoutes.post(`${BASE}/:sessionId/runs/:runId/cancel`, async (c) => {
  const { projectId, artifactDirId, sessionId, runId } = c.req.param();
  const sessionKey = getSessionRunKey(projectId, artifactDirId, sessionId);
  const run = sessionRunRegistry.getRun(sessionKey, runId);

  if (!run) {
    return c.json({ error: 'Run not found' }, 404);
  }

  if (!run.isRunning()) {
    return c.json<StreamConflictResponse>(
      {
        error: 'Run is not active.',
        liveRun: toLiveRunSummaryDto(run.summary),
      },
      409
    );
  }

  sessionRunRegistry.cancelRun(sessionKey, runId);
  return c.json<CancelSessionRunResponse>({
    ok: true,
    sessionId,
    runId,
    cancelled: true,
  });
});
