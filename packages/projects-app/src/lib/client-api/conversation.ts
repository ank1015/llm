import { apiRequestJson, SERVER_BASE } from './http';

import type { StreamEventMap, StreamEventName, TurnSettings } from '@/lib/contracts';
import type { MessageNode } from '@ank1015/llm-sdk';

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

export type StreamHandlers = {
  onEvent?: <TEvent extends StreamEventName>(
    eventName: TEvent,
    data: StreamEventMap[TEvent]
  ) => void;
};

export type StreamRequest = ArtifactContext & {
  sessionId: string;
  message: string;
  skills?: string[];
} & TurnSettings;

export type StreamRetryRequest = ArtifactContext & {
  sessionId: string;
  nodeId: string;
} & TurnSettings;

export type StreamEditRequest = ArtifactContext & {
  sessionId: string;
  nodeId: string;
  message: string;
} & TurnSettings;

type StreamRequestBody = {
  message?: string;
  skills?: string[];
  api: TurnSettings['api'];
  modelId: string;
  reasoningLevel: TurnSettings['reasoningLevel'];
};

// eslint-disable-next-line sonarjs/cognitive-complexity
async function streamConversationRequest(
  url: string,
  body: StreamRequestBody,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
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
      message: request.message,
      skills: request.skills ?? [],
      api: request.api,
      modelId: request.modelId,
      reasoningLevel: request.reasoningLevel,
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
      api: request.api,
      modelId: request.modelId,
      reasoningLevel: request.reasoningLevel,
    },
    handlers,
    signal
  );
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
      message: request.message,
      api: request.api,
      modelId: request.modelId,
      reasoningLevel: request.reasoningLevel,
    },
    handlers,
    signal
  );
}
