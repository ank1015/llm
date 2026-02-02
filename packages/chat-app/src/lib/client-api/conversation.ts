import { apiRequestJson, buildQueryString } from './http';

import type {
  ConversationTurnRequest,
  ConversationTurnResponse,
  SessionMessagesRequest,
  SessionMessagesResponse,
  StreamEventMap,
  StreamEventName,
} from '@/lib/contracts';

function normalizeScope<T extends { projectName?: string; path?: string }>(scope: T): T {
  const projectName = scope.projectName?.trim();
  const path = scope.path?.trim();

  return {
    ...scope,
    projectName: projectName && projectName.length > 0 ? projectName : undefined,
    path: path && path.length > 0 ? path : undefined,
  };
}

function buildMessagesPath(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/messages`;
}

function buildStreamPath(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/stream`;
}

function buildConversationBody(input: ConversationTurnRequest): Record<string, unknown> {
  const normalized = normalizeScope(input);

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    api: input.api,
    modelId: input.modelId,
  };

  if (normalized.projectName) {
    body.projectName = normalized.projectName;
  }

  if (normalized.path) {
    body.path = normalized.path;
  }

  if (input.branch && input.branch.trim().length > 0) {
    body.branch = input.branch.trim();
  }

  if (input.parentId && input.parentId.trim().length > 0) {
    body.parentId = input.parentId.trim();
  }

  if (input.systemPrompt && input.systemPrompt.trim().length > 0) {
    body.systemPrompt = input.systemPrompt.trim();
  }

  if (input.providerOptions && Object.keys(input.providerOptions).length > 0) {
    body.providerOptions = input.providerOptions;
  }

  if (input.attachments && input.attachments.length > 0) {
    body.attachments = input.attachments;
  }

  return body;
}

function buildMessagesQuery(request: SessionMessagesRequest): string {
  const normalized = normalizeScope(request);

  return buildQueryString({
    projectName: normalized.projectName,
    path: normalized.path,
    branch: request.branch,
    limit: request.limit,
    offset: request.offset,
  });
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
  request: SessionMessagesRequest
): Promise<SessionMessagesResponse> {
  const query = buildMessagesQuery(request);

  return apiRequestJson<SessionMessagesResponse>(
    `${buildMessagesPath(request.sessionId)}${query}`,
    {
      method: 'GET',
    }
  );
}

export async function promptConversation(
  request: ConversationTurnRequest
): Promise<ConversationTurnResponse> {
  return apiRequestJson<ConversationTurnResponse>(buildMessagesPath(request.sessionId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildConversationBody(request)),
  });
}

export type StreamHandlers = {
  onEvent?: <TEvent extends StreamEventName>(
    eventName: TEvent,
    data: StreamEventMap[TEvent]
  ) => void;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function streamConversation(
  request: ConversationTurnRequest,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(buildStreamPath(request.sessionId), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildConversationBody(request)),
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `Request failed: ${response.status}`);
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
