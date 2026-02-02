'use client';

import { create } from 'zustand';

import type { AgentEvent, Api, Attachment, MessageNode } from '@ank1015/llm-sdk';

type SessionScope = {
  projectName?: string;
  path?: string;
};

type SessionRef = SessionScope & {
  sessionId: string;
};

type ChatPromptInput = SessionRef & {
  prompt: string;
  api: Api;
  modelId: string;
  branch?: string;
  parentId?: string;
  providerOptions?: Record<string, unknown>;
  systemPrompt?: string;
  attachments?: Attachment[];
};

type PendingPrompt = {
  id: string;
  prompt: string;
  createdAt: number;
  status: 'pending' | 'failed';
  error?: string;
};

type ChatStoreState = {
  activeSession: SessionRef | null;
  messagesBySession: Record<string, MessageNode[]>;
  pendingPromptsBySession: Record<string, PendingPrompt[]>;
  agentEventsBySession: Record<string, AgentEvent[]>;
  isLoadingMessagesBySession: Record<string, boolean>;
  isStreamingBySession: Record<string, boolean>;
  errorsBySession: Record<string, string | null>;
  setActiveSession: (session: SessionRef | null) => void;
  clearSessionState: (session: SessionRef) => void;
  clearSessionError: (session: SessionRef) => void;
  loadMessages: (options?: {
    session?: SessionRef;
    branch?: string;
    force?: boolean;
  }) => Promise<void>;
  sendMessage: (input: ChatPromptInput) => Promise<void>;
  startStream: (input: ChatPromptInput) => Promise<void>;
  abortStream: (session: SessionRef) => void;
};

type MessagesApiResponse = {
  ok: boolean;
  messages: MessageNode[];
};

type PromptApiResponse = {
  ok: boolean;
  nodes: MessageNode[];
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

const MAX_AGENT_EVENTS = 200;

const messageLoadRequestIds = new Map<string, number>();
const streamAbortControllers = new Map<string, AbortController>();

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSessionRef(session: SessionRef): SessionRef {
  return {
    sessionId: session.sessionId,
    projectName: normalizeText(session.projectName),
    path: normalizeText(session.path),
  };
}

function getSessionKey(session: SessionRef): string {
  const normalized = normalizeSessionRef(session);
  return `${normalized.projectName ?? ''}::${normalized.path ?? ''}::${normalized.sessionId}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unexpected chat error.';
}

function createPendingPrompt(prompt: string): PendingPrompt {
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    prompt,
    createdAt: Date.now(),
    status: 'pending',
  };
}

function mergeMessageNodes(existing: MessageNode[], incoming: MessageNode[]): MessageNode[] {
  if (incoming.length === 0) {
    return existing;
  }

  const merged = [...existing];
  const indexById = new Map<string, number>();

  for (const [index, node] of merged.entries()) {
    indexById.set(node.id, index);
  }

  for (const node of incoming) {
    const existingIndex = indexById.get(node.id);
    if (existingIndex === undefined) {
      indexById.set(node.id, merged.length);
      merged.push(node);
      continue;
    }

    merged[existingIndex] = node;
  }

  merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return merged;
}

function buildMessagesUrl(params: SessionRef & { branch?: string }): string {
  const search = new URLSearchParams();

  if (params.projectName) {
    search.set('projectName', params.projectName);
  }

  if (params.path) {
    search.set('path', params.path);
  }

  const branch = normalizeText(params.branch);
  if (branch) {
    search.set('branch', branch);
  }

  const queryString = search.toString();
  const base = `/api/sessions/${encodeURIComponent(params.sessionId)}/messages`;
  return queryString.length > 0 ? `${base}?${queryString}` : base;
}

function buildStreamUrl(params: SessionRef): string {
  return `/api/sessions/${encodeURIComponent(params.sessionId)}/stream`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorResponse & { ok?: boolean };

  if (!response.ok || data.ok === false) {
    throw new Error(data.error?.message ?? 'API request failed.');
  }

  return data;
}

function buildPromptBody(input: ChatPromptInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    api: input.api,
    modelId: input.modelId,
  };

  const projectName = normalizeText(input.projectName);
  const path = normalizeText(input.path);
  const branch = normalizeText(input.branch);
  const parentId = normalizeText(input.parentId);
  const systemPrompt = normalizeText(input.systemPrompt);

  if (projectName) {
    body.projectName = projectName;
  }

  if (path) {
    body.path = path;
  }

  if (branch) {
    body.branch = branch;
  }

  if (parentId) {
    body.parentId = parentId;
  }

  if (systemPrompt) {
    body.systemPrompt = systemPrompt;
  }

  if (input.providerOptions && Object.keys(input.providerOptions).length > 0) {
    body.providerOptions = input.providerOptions;
  }

  if (input.attachments && input.attachments.length > 0) {
    body.attachments = input.attachments;
  }

  return body;
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  if (block.trim().length === 0) {
    return null;
  }

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) {
    return { event, data: null };
  }

  const rawData = dataLines.join('\n');

  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
async function consumeEventStream(
  response: Response,
  handlers: {
    onAgentEvent: (event: AgentEvent) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error('Missing stream body from server.');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const boundaryIndex = buffer.indexOf('\n\n');
        if (boundaryIndex === -1) {
          break;
        }

        const chunk = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const parsed = parseSseBlock(chunk);
        if (!parsed) {
          continue;
        }

        if (parsed.event === 'agent_event' && parsed.data && typeof parsed.data === 'object') {
          handlers.onAgentEvent(parsed.data as AgentEvent);
          continue;
        }

        if (parsed.event === 'error') {
          const message =
            parsed.data && typeof parsed.data === 'object' && 'message' in parsed.data
              ? String((parsed.data as { message?: unknown }).message ?? 'Stream failed.')
              : 'Stream failed.';
          handlers.onError(message);
          throw new Error(message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function resolveSession(options: {
  activeSession: SessionRef | null;
  session?: SessionRef;
}): SessionRef {
  const candidate = options.session ?? options.activeSession;
  if (!candidate) {
    throw new Error('No active session selected.');
  }

  return normalizeSessionRef(candidate);
}

function upsertPendingPrompt(
  pendingBySession: Record<string, PendingPrompt[]>,
  key: string,
  pending: PendingPrompt
): Record<string, PendingPrompt[]> {
  const existing = pendingBySession[key] ?? [];
  return {
    ...pendingBySession,
    [key]: [...existing, pending],
  };
}

function removePendingPrompt(
  pendingBySession: Record<string, PendingPrompt[]>,
  key: string,
  pendingId: string
): Record<string, PendingPrompt[]> {
  const existing = pendingBySession[key] ?? [];
  const filtered = existing.filter((item) => item.id !== pendingId);

  return {
    ...pendingBySession,
    [key]: filtered,
  };
}

function markPendingFailed(
  pendingBySession: Record<string, PendingPrompt[]>,
  key: string,
  pendingId: string,
  error: string
): Record<string, PendingPrompt[]> {
  const existing = pendingBySession[key] ?? [];

  return {
    ...pendingBySession,
    [key]: existing.map((item) =>
      item.id === pendingId
        ? {
            ...item,
            status: 'failed',
            error,
          }
        : item
    ),
  };
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  activeSession: null,
  messagesBySession: {},
  pendingPromptsBySession: {},
  agentEventsBySession: {},
  isLoadingMessagesBySession: {},
  isStreamingBySession: {},
  errorsBySession: {},

  setActiveSession: (session) => {
    if (!session) {
      set({ activeSession: null });
      return;
    }

    const normalized = normalizeSessionRef(session);
    const key = getSessionKey(normalized);

    set((state) => ({
      activeSession: normalized,
      messagesBySession: {
        ...state.messagesBySession,
        [key]: state.messagesBySession[key] ?? [],
      },
      pendingPromptsBySession: {
        ...state.pendingPromptsBySession,
        [key]: state.pendingPromptsBySession[key] ?? [],
      },
      agentEventsBySession: {
        ...state.agentEventsBySession,
        [key]: state.agentEventsBySession[key] ?? [],
      },
      errorsBySession: {
        ...state.errorsBySession,
        [key]: state.errorsBySession[key] ?? null,
      },
    }));
  },

  clearSessionState: (session) => {
    const key = getSessionKey(normalizeSessionRef(session));

    streamAbortControllers.get(key)?.abort();
    streamAbortControllers.delete(key);

    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [key]: [],
      },
      pendingPromptsBySession: {
        ...state.pendingPromptsBySession,
        [key]: [],
      },
      agentEventsBySession: {
        ...state.agentEventsBySession,
        [key]: [],
      },
      isLoadingMessagesBySession: {
        ...state.isLoadingMessagesBySession,
        [key]: false,
      },
      isStreamingBySession: {
        ...state.isStreamingBySession,
        [key]: false,
      },
      errorsBySession: {
        ...state.errorsBySession,
        [key]: null,
      },
    }));
  },

  clearSessionError: (session) => {
    const key = getSessionKey(normalizeSessionRef(session));

    set((state) => ({
      errorsBySession: {
        ...state.errorsBySession,
        [key]: null,
      },
    }));
  },

  loadMessages: async (options) => {
    const session = resolveSession({
      activeSession: get().activeSession,
      session: options?.session,
    });

    const key = getSessionKey(session);
    const isLoading = get().isLoadingMessagesBySession[key] ?? false;

    if (isLoading && !options?.force) {
      return;
    }

    const nextRequestId = (messageLoadRequestIds.get(key) ?? 0) + 1;
    messageLoadRequestIds.set(key, nextRequestId);

    set((state) => ({
      isLoadingMessagesBySession: {
        ...state.isLoadingMessagesBySession,
        [key]: true,
      },
      errorsBySession: {
        ...state.errorsBySession,
        [key]: null,
      },
    }));

    try {
      const response = await fetch(
        buildMessagesUrl({
          ...session,
          branch: options?.branch,
        }),
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const payload = await parseJsonResponse<MessagesApiResponse>(response);

      if ((messageLoadRequestIds.get(key) ?? 0) !== nextRequestId) {
        return;
      }

      set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [key]: payload.messages,
        },
        isLoadingMessagesBySession: {
          ...state.isLoadingMessagesBySession,
          [key]: false,
        },
      }));
    } catch (error) {
      if ((messageLoadRequestIds.get(key) ?? 0) !== nextRequestId) {
        return;
      }

      set((state) => ({
        isLoadingMessagesBySession: {
          ...state.isLoadingMessagesBySession,
          [key]: false,
        },
        errorsBySession: {
          ...state.errorsBySession,
          [key]: getErrorMessage(error),
        },
      }));
    }
  },

  sendMessage: async (input) => {
    const session = normalizeSessionRef(input);
    const key = getSessionKey(session);
    const prompt = input.prompt.trim();

    if (prompt.length === 0) {
      throw new Error('Prompt cannot be empty.');
    }

    const pending = createPendingPrompt(prompt);

    set((state) => ({
      pendingPromptsBySession: upsertPendingPrompt(state.pendingPromptsBySession, key, pending),
      errorsBySession: {
        ...state.errorsBySession,
        [key]: null,
      },
    }));

    try {
      const response = await fetch(buildMessagesUrl(session), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(buildPromptBody(input)),
      });

      const payload = await parseJsonResponse<PromptApiResponse>(response);

      set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [key]: mergeMessageNodes(state.messagesBySession[key] ?? [], payload.nodes),
        },
        pendingPromptsBySession: removePendingPrompt(
          state.pendingPromptsBySession,
          key,
          pending.id
        ),
      }));
    } catch (error) {
      const message = getErrorMessage(error);

      set((state) => ({
        pendingPromptsBySession: markPendingFailed(
          state.pendingPromptsBySession,
          key,
          pending.id,
          message
        ),
        errorsBySession: {
          ...state.errorsBySession,
          [key]: message,
        },
      }));

      throw error;
    }
  },

  startStream: async (input) => {
    const session = normalizeSessionRef(input);
    const key = getSessionKey(session);
    const prompt = input.prompt.trim();

    if (prompt.length === 0) {
      throw new Error('Prompt cannot be empty.');
    }

    if (get().isStreamingBySession[key]) {
      throw new Error('A stream is already running for this session.');
    }

    streamAbortControllers.get(key)?.abort();

    const pending = createPendingPrompt(prompt);
    const controller = new AbortController();
    streamAbortControllers.set(key, controller);

    set((state) => ({
      pendingPromptsBySession: upsertPendingPrompt(state.pendingPromptsBySession, key, pending),
      agentEventsBySession: {
        ...state.agentEventsBySession,
        [key]: [],
      },
      isStreamingBySession: {
        ...state.isStreamingBySession,
        [key]: true,
      },
      errorsBySession: {
        ...state.errorsBySession,
        [key]: null,
      },
    }));

    try {
      const response = await fetch(buildStreamUrl(session), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(buildPromptBody(input)),
        signal: controller.signal,
      });

      if (!response.ok) {
        await parseJsonResponse<Record<string, never>>(response);
      }

      await consumeEventStream(response, {
        onAgentEvent: (event) => {
          set((state) => {
            const existingEvents = state.agentEventsBySession[key] ?? [];
            const nextEvents = [...existingEvents, event];

            if (nextEvents.length > MAX_AGENT_EVENTS) {
              nextEvents.splice(0, nextEvents.length - MAX_AGENT_EVENTS);
            }

            return {
              agentEventsBySession: {
                ...state.agentEventsBySession,
                [key]: nextEvents,
              },
            };
          });
        },
        onError: (message) => {
          set((state) => ({
            errorsBySession: {
              ...state.errorsBySession,
              [key]: message,
            },
          }));
        },
      });

      await get().loadMessages({ session, branch: input.branch, force: true });

      set((state) => ({
        pendingPromptsBySession: removePendingPrompt(
          state.pendingPromptsBySession,
          key,
          pending.id
        ),
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        set((state) => ({
          pendingPromptsBySession: removePendingPrompt(
            state.pendingPromptsBySession,
            key,
            pending.id
          ),
        }));
      } else {
        const message = getErrorMessage(error);

        set((state) => ({
          pendingPromptsBySession: markPendingFailed(
            state.pendingPromptsBySession,
            key,
            pending.id,
            message
          ),
          errorsBySession: {
            ...state.errorsBySession,
            [key]: message,
          },
        }));
      }

      throw error;
    } finally {
      streamAbortControllers.delete(key);

      set((state) => ({
        isStreamingBySession: {
          ...state.isStreamingBySession,
          [key]: false,
        },
      }));
    }
  },

  abortStream: (session) => {
    const key = getSessionKey(normalizeSessionRef(session));
    const controller = streamAbortControllers.get(key);
    if (!controller) {
      return;
    }

    controller.abort();
    streamAbortControllers.delete(key);

    set((state) => ({
      isStreamingBySession: {
        ...state.isStreamingBySession,
        [key]: false,
      },
    }));
  },
}));

export type { ChatPromptInput, PendingPrompt, SessionRef };
