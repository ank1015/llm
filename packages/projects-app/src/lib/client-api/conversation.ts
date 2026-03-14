import { apiRequestJson, SERVER_BASE } from './http';

import type {
  LiveRunSummary,
  SessionTreeResponse,
  StreamEventMap,
  StreamEventName,
  TurnSettings,
  VisibleLeafSelection,
} from '@/lib/contracts';
import type { MessageNode } from '@ank1015/llm-types';

type ArtifactContext = {
  projectId: string;
  artifactId: string;
};

function buildSessionsBase(ctx: ArtifactContext): string {
  return `${SERVER_BASE}/api/projects/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}/sessions`;
}

function buildMessagesPath(ctx: ArtifactContext, sessionId: string): string {
  return `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}/messages`;
}

function buildTreePath(ctx: ArtifactContext, sessionId: string): string {
  return `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}/tree`;
}

function buildStreamPath(ctx: ArtifactContext, sessionId: string): string {
  return `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}/stream`;
}

function buildRewriteStreamPath(
  ctx: ArtifactContext,
  sessionId: string,
  nodeId: string,
  action: 'retry' | 'edit'
): string {
  return `${buildMessagesPath(ctx, sessionId)}/${encodeURIComponent(nodeId)}/${action}/stream`;
}

function buildAttachRunStreamPath(
  ctx: ArtifactContext,
  sessionId: string,
  runId: string,
  afterSeq?: number
): string {
  const url = new URL(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/stream`
  );
  if (afterSeq !== undefined && afterSeq > 0) {
    url.searchParams.set('afterSeq', String(afterSeq));
  }
  return url.toString();
}

function buildCancelRunPath(ctx: ArtifactContext, sessionId: string, runId: string): string {
  return `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}/cancel`;
}

type SseParsedEvent = {
  event: StreamEventName | string;
  data: unknown;
};

function parseSseBlock(block: string): SseParsedEvent | undefined {
  const trimmed = block.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) {
    return {
      event,
      data: null,
    };
  }

  const rawData = dataLines.join('\n');

  try {
    return {
      event,
      data: JSON.parse(rawData),
    };
  } catch {
    return {
      event,
      data: rawData,
    };
  }
}

function normalizeSseChunk(value: string): string {
  return value.replaceAll('\r\n', '\n');
}

export async function getSessionMessages(
  ctx: ArtifactContext,
  sessionId: string
): Promise<MessageNode[]> {
  return apiRequestJson<MessageNode[]>(buildMessagesPath(ctx, sessionId), {
    method: 'GET',
  });
}

export async function getSessionTree(
  ctx: ArtifactContext,
  sessionId: string
): Promise<SessionTreeResponse> {
  return apiRequestJson<SessionTreeResponse>(buildTreePath(ctx, sessionId), {
    method: 'GET',
  });
}

export type StreamHandlers = {
  onEvent?: <TEvent extends StreamEventName>(
    eventName: TEvent,
    data: StreamEventMap[TEvent]
  ) => void;
};

export class StreamConflictError extends Error {
  liveRun: LiveRunSummary;

  constructor(liveRun: LiveRunSummary) {
    super('A stream is already running for this session.');
    this.name = 'StreamConflictError';
    this.liveRun = liveRun;
  }
}

export type StreamRequest = ArtifactContext & {
  sessionId: string;
  message: string;
} & TurnSettings &
  VisibleLeafSelection;

export type StreamRetryRequest = ArtifactContext & {
  sessionId: string;
  nodeId: string;
} & TurnSettings &
  VisibleLeafSelection;

export type StreamEditRequest = ArtifactContext & {
  sessionId: string;
  nodeId: string;
  message: string;
} & TurnSettings &
  VisibleLeafSelection;

export type AttachRunRequest = ArtifactContext & {
  sessionId: string;
  runId: string;
  afterSeq?: number;
};

export type CancelRunRequest = ArtifactContext & {
  sessionId: string;
  runId: string;
};

type StreamRequestBody = {
  message?: string;
  leafNodeId?: string;
  api: TurnSettings['api'];
  modelId: string;
  reasoningLevel: TurnSettings['reasoningLevel'];
};

// eslint-disable-next-line sonarjs/cognitive-complexity
async function streamConversationRequest(
  url: string,
  request: {
    method?: 'GET' | 'POST';
    body?: StreamRequestBody;
  },
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: request.method ?? 'POST',
    headers: {
      Accept: 'text/event-stream',
      ...(request.body
        ? {
            'Content-Type': 'application/json',
          }
        : {}),
    },
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      liveRun?: LiveRunSummary;
    };
    if (response.status === 409 && body.liveRun) {
      throw new StreamConflictError(body.liveRun);
    }
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  const stream = response.body;
  if (!stream) {
    throw new Error('Missing stream body from server.');
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += normalizeSseChunk(decoder.decode(value, { stream: true }));

      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary === -1) {
          break;
        }

        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const parsed = parseSseBlock(block);
        if (!parsed) {
          continue;
        }

        if (parsed.event === 'ready') {
          handlers.onEvent?.('ready', parsed.data as StreamEventMap['ready']);
          continue;
        }

        if (parsed.event === 'agent_event') {
          handlers.onEvent?.('agent_event', parsed.data as StreamEventMap['agent_event']);
          continue;
        }

        if (parsed.event === 'node_persisted') {
          handlers.onEvent?.('node_persisted', parsed.data as StreamEventMap['node_persisted']);
          continue;
        }

        if (parsed.event === 'done') {
          handlers.onEvent?.('done', parsed.data as StreamEventMap['done']);
          continue;
        }

        if (parsed.event === 'error') {
          const data = parsed.data as StreamEventMap['error'];
          handlers.onEvent?.('error', data);
          throw new Error(data.message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamConversation(
  request: StreamRequest,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const ctx: ArtifactContext = { projectId: request.projectId, artifactId: request.artifactId };
  await streamConversationRequest(
    buildStreamPath(ctx, request.sessionId),
    {
      method: 'POST',
      body: {
        message: request.message,
        ...(request.leafNodeId ? { leafNodeId: request.leafNodeId } : {}),
        api: request.api,
        modelId: request.modelId,
        reasoningLevel: request.reasoningLevel,
      },
    },
    handlers,
    signal
  );
}

export async function attachToSessionRun(
  request: AttachRunRequest,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const ctx: ArtifactContext = { projectId: request.projectId, artifactId: request.artifactId };
  await streamConversationRequest(
    buildAttachRunStreamPath(ctx, request.sessionId, request.runId, request.afterSeq),
    {
      method: 'GET',
    },
    handlers,
    signal
  );
}

export async function streamRetryConversation(
  request: StreamRetryRequest,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const ctx: ArtifactContext = { projectId: request.projectId, artifactId: request.artifactId };
  await streamConversationRequest(
    buildRewriteStreamPath(ctx, request.sessionId, request.nodeId, 'retry'),
    {
      method: 'POST',
      body: {
        ...(request.leafNodeId ? { leafNodeId: request.leafNodeId } : {}),
        api: request.api,
        modelId: request.modelId,
        reasoningLevel: request.reasoningLevel,
      },
    },
    handlers,
    signal
  );
}

export async function cancelSessionRun(request: CancelRunRequest): Promise<{ ok: true }> {
  const ctx: ArtifactContext = { projectId: request.projectId, artifactId: request.artifactId };
  return apiRequestJson<{ ok: true }>(buildCancelRunPath(ctx, request.sessionId, request.runId), {
    method: 'POST',
  });
}

export async function streamEditConversation(
  request: StreamEditRequest,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const ctx: ArtifactContext = { projectId: request.projectId, artifactId: request.artifactId };
  await streamConversationRequest(
    buildRewriteStreamPath(ctx, request.sessionId, request.nodeId, 'edit'),
    {
      method: 'POST',
      body: {
        message: request.message,
        ...(request.leafNodeId ? { leafNodeId: request.leafNodeId } : {}),
        api: request.api,
        modelId: request.modelId,
        reasoningLevel: request.reasoningLevel,
      },
    },
    handlers,
    signal
  );
}
