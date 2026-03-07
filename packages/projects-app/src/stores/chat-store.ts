'use client';

import { create } from 'zustand';

import type { SessionRef, TurnSettings } from '@/lib/contracts';
import type {
  AgentEvent,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  MessageNode,
} from '@ank1015/llm-sdk';

import { getSessionMessages, streamConversation } from '@/lib/client-api';

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
  streamingAssistantBySession: Record<string, Omit<BaseAssistantMessage<Api>, 'message'> | null>;
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
    projectId?: string;
    artifactId?: string;
    force?: boolean;
  }) => Promise<void>;
  startStream: (
    input: {
      sessionId: string;
      prompt: string;
      projectId: string;
      artifactId: string;
    } & TurnSettings
  ) => Promise<void>;
  abortStream: (session: SessionRef) => void;
};

const MAX_AGENT_EVENTS = 200;

const messageLoadRequestIds = new Map<string, number>();
const streamAbortControllers = new Map<string, AbortController>();

function getSessionKey(session: SessionRef): string {
  return session.sessionId;
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

function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

function upsertOptimisticMessageNode(
  existing: MessageNode[],
  incoming: MessageNode
): MessageNode[] {
  const incomingMessageId = incoming.message.id;
  const next = [...existing];
  const index = next.findIndex((node) => node.message.id === incomingMessageId);

  if (index === -1) {
    next.push(incoming);
  } else {
    next[index] = incoming;
  }

  next.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return next;
}

function createOptimisticNode(input: {
  message: Message;
  parentId: string | null;
  api: Api;
  modelId: string;
}): MessageNode {
  return {
    type: 'message',
    id: `optimistic:${input.message.id}`,
    parentId: input.parentId,
    branch: 'main',
    timestamp: toIsoTimestamp(input.message.timestamp),
    message: input.message,
    api: input.api,
    modelId: input.modelId,
    providerOptions: {},
  };
}

function resolveSession(options: {
  activeSession: SessionRef | null;
  session?: SessionRef;
}): SessionRef {
  const candidate = options.session ?? options.activeSession;
  if (!candidate) {
    throw new Error('No active session selected.');
  }

  return candidate;
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

function getStreamingAssistantMessage(
  eventMessage: Message | BaseAssistantEvent<Api>
): Omit<BaseAssistantMessage<Api>, 'message'> | null {
  if (typeof eventMessage !== 'object' || eventMessage === null || !('type' in eventMessage)) {
    return null;
  }

  const candidate = (eventMessage as BaseAssistantEvent<Api>).message;
  if (!candidate || candidate.role !== 'assistant') {
    return null;
  }

  return candidate;
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  activeSession: null,
  messagesBySession: {},
  streamingAssistantBySession: {},
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

    const key = getSessionKey(session);

    set((state) => ({
      activeSession: session,
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
      streamingAssistantBySession: {
        ...state.streamingAssistantBySession,
        [key]: state.streamingAssistantBySession[key] ?? null,
      },
    }));
  },

  clearSessionState: (session) => {
    const key = getSessionKey(session);

    streamAbortControllers.get(key)?.abort();
    streamAbortControllers.delete(key);

    set((state) => ({
      streamingAssistantBySession: (() => {
        const next = { ...state.streamingAssistantBySession };
        delete next[key];
        return next;
      })(),
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
    const key = getSessionKey(session);

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
      const ctx = { projectId: options?.projectId ?? '', artifactId: options?.artifactId ?? '' };
      const messages = await getSessionMessages(ctx, session.sessionId);

      if ((messageLoadRequestIds.get(key) ?? 0) !== nextRequestId) {
        return;
      }

      set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [key]: messages,
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

  startStream: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
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
    let optimisticParentId = (get().messagesBySession[key] ?? []).at(-1)?.id ?? null;

    set((state) => ({
      pendingPromptsBySession: upsertPendingPrompt(state.pendingPromptsBySession, key, pending),
      agentEventsBySession: {
        ...state.agentEventsBySession,
        [key]: [],
      },
      streamingAssistantBySession: {
        ...state.streamingAssistantBySession,
        [key]: null,
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
        {
          sessionId: input.sessionId,
          message: prompt,
          projectId: input.projectId,
          artifactId: input.artifactId,
          api: input.api,
          modelId: input.modelId,
          reasoningLevel: input.reasoningLevel,
        },
        {
          onEvent: (eventName, data) => {
            if (eventName === 'agent_event') {
              const agentEvent = data as AgentEvent;

              set((state) => {
                const existingEvents = state.agentEventsBySession[key] ?? [];
                const nextEvents = [...existingEvents, agentEvent];

                if (nextEvents.length > MAX_AGENT_EVENTS) {
                  nextEvents.splice(0, nextEvents.length - MAX_AGENT_EVENTS);
                }

                const nextState: Partial<ChatStoreState> = {
                  agentEventsBySession: {
                    ...state.agentEventsBySession,
                    [key]: nextEvents,
                  },
                };

                if (
                  agentEvent.type === 'message_update' &&
                  agentEvent.messageType === 'assistant'
                ) {
                  const streamingAssistant = getStreamingAssistantMessage(agentEvent.message);
                  if (streamingAssistant) {
                    nextState.streamingAssistantBySession = {
                      ...state.streamingAssistantBySession,
                      [key]: streamingAssistant,
                    };
                  }
                }

                if (agentEvent.type === 'message_end') {
                  const optimisticNode = createOptimisticNode({
                    message: agentEvent.message,
                    parentId: optimisticParentId,
                    api: input.api,
                    modelId: input.modelId,
                  });

                  optimisticParentId = optimisticNode.id;

                  nextState.messagesBySession = {
                    ...state.messagesBySession,
                    [key]: upsertOptimisticMessageNode(
                      state.messagesBySession[key] ?? [],
                      optimisticNode
                    ),
                  };

                  if (agentEvent.messageType === 'assistant') {
                    nextState.streamingAssistantBySession = {
                      ...state.streamingAssistantBySession,
                      [key]: null,
                    };
                  }
                }

                return nextState;
              });
            }

            if (eventName === 'error') {
              const message = (data as { message: string }).message;
              set((state) => ({
                errorsBySession: {
                  ...state.errorsBySession,
                  [key]: message,
                },
                streamingAssistantBySession: {
                  ...state.streamingAssistantBySession,
                  [key]: null,
                },
              }));
            }
          },
        },
        controller.signal
      );

      await get().loadMessages({
        session,
        projectId: input.projectId,
        artifactId: input.artifactId,
        force: true,
      });

      set((state) => ({
        pendingPromptsBySession: removePendingPrompt(
          state.pendingPromptsBySession,
          key,
          pending.id
        ),
        streamingAssistantBySession: {
          ...state.streamingAssistantBySession,
          [key]: null,
        },
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        set((state) => ({
          pendingPromptsBySession: removePendingPrompt(
            state.pendingPromptsBySession,
            key,
            pending.id
          ),
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
          },
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
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
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
    const key = getSessionKey(session);
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

export type { PendingPrompt, SessionRef };
