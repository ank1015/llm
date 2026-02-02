'use client';

import { create } from 'zustand';

import type { ConversationTurnRequest, SessionRef } from '@/lib/contracts';
import type { AgentEvent, MessageNode } from '@ank1015/llm-sdk';

import { getSessionMessages, promptConversation, streamConversation } from '@/lib/client-api';

type ChatPromptInput = ConversationTurnRequest;

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

function normalizePromptInput(input: ChatPromptInput): ChatPromptInput {
  return {
    ...input,
    projectName: normalizeText(input.projectName),
    path: normalizeText(input.path),
    prompt: input.prompt,
    branch: normalizeText(input.branch),
    parentId: normalizeText(input.parentId),
    systemPrompt: normalizeText(input.systemPrompt),
    attachments: input.attachments,
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
      const payload = await getSessionMessages({
        ...session,
        branch: options?.branch,
      });

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
    const normalizedInput = normalizePromptInput(input);
    const session = normalizeSessionRef(normalizedInput);
    const key = getSessionKey(session);
    const prompt = normalizedInput.prompt.trim();

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
      const payload = await promptConversation(normalizedInput);

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
    const normalizedInput = normalizePromptInput(input);
    const session = normalizeSessionRef(normalizedInput);
    const key = getSessionKey(session);
    const prompt = normalizedInput.prompt.trim();

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
      await streamConversation(
        normalizedInput,
        {
          onEvent: (eventName, data) => {
            if (eventName === 'agent_event') {
              set((state) => {
                const existingEvents = state.agentEventsBySession[key] ?? [];
                const nextEvents = [...existingEvents, data as AgentEvent];

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
            }

            if (eventName === 'error') {
              const message = (data as { message: string }).message;
              set((state) => ({
                errorsBySession: {
                  ...state.errorsBySession,
                  [key]: message,
                },
              }));
            }
          },
        },
        controller.signal
      );

      await get().loadMessages({ session, branch: normalizedInput.branch, force: true });

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
