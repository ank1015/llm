'use client';

import { create } from 'zustand';

import type { ConversationTurnRequest, SessionRef } from '@/lib/contracts';
import type {
  AgentEvent,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  MessageNode,
} from '@ank1015/llm-sdk';

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
  activeBranchBySession: Record<string, string>;
  streamingAssistantBySession: Record<string, Omit<BaseAssistantMessage<Api>, 'message'> | null>;
  pendingPromptsBySession: Record<string, PendingPrompt[]>;
  agentEventsBySession: Record<string, AgentEvent[]>;
  isLoadingMessagesBySession: Record<string, boolean>;
  isStreamingBySession: Record<string, boolean>;
  errorsBySession: Record<string, string | null>;
  setActiveSession: (session: SessionRef | null) => void;
  setActiveBranch: (session: SessionRef, branch: string) => void;
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
  branch: string;
  api: ConversationTurnRequest['api'];
  modelId: string;
  providerOptions?: Record<string, unknown>;
}): MessageNode {
  return {
    type: 'message',
    id: `optimistic:${input.message.id}`,
    parentId: input.parentId,
    branch: input.branch,
    timestamp: toIsoTimestamp(input.message.timestamp),
    message: input.message,
    api: input.api,
    modelId: input.modelId,
    providerOptions: { ...(input.providerOptions ?? {}) },
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

function getLatestBranch(messages: MessageNode[]): string | undefined {
  return normalizeText(messages[messages.length - 1]?.branch);
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
  activeBranchBySession: {},
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
      activeBranchBySession: {
        ...state.activeBranchBySession,
        [key]: state.activeBranchBySession[key] ?? 'main',
      },
      streamingAssistantBySession: {
        ...state.streamingAssistantBySession,
        [key]: state.streamingAssistantBySession[key] ?? null,
      },
    }));
  },

  setActiveBranch: (session, branch) => {
    const key = getSessionKey(normalizeSessionRef(session));
    const normalizedBranch = normalizeText(branch) ?? 'main';

    set((state) => ({
      activeBranchBySession: {
        ...state.activeBranchBySession,
        [key]: normalizedBranch,
      },
    }));
  },

  clearSessionState: (session) => {
    const key = getSessionKey(normalizeSessionRef(session));

    streamAbortControllers.get(key)?.abort();
    streamAbortControllers.delete(key);

    set((state) => ({
      activeBranchBySession: (() => {
        const next = { ...state.activeBranchBySession };
        delete next[key];
        return next;
      })(),
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
      const requestedBranch = normalizeText(options?.branch);
      const payload = await getSessionMessages({
        ...session,
        branch: requestedBranch,
      });

      if ((messageLoadRequestIds.get(key) ?? 0) !== nextRequestId) {
        return;
      }

      const resolvedBranch =
        normalizeText(payload.branch ?? undefined) ??
        getLatestBranch(payload.messages) ??
        get().activeBranchBySession[key] ??
        'main';

      set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [key]: payload.messages,
        },
        activeBranchBySession: {
          ...state.activeBranchBySession,
          [key]: resolvedBranch,
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
    const branch = normalizedInput.branch ?? get().activeBranchBySession[key] ?? 'main';
    const requestInput: ChatPromptInput = {
      ...normalizedInput,
      branch,
    };
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
      const payload = await promptConversation(requestInput);

      set((state) => ({
        messagesBySession: {
          ...state.messagesBySession,
          [key]: mergeMessageNodes(state.messagesBySession[key] ?? [], payload.nodes),
        },
        activeBranchBySession: {
          ...state.activeBranchBySession,
          [key]: payload.branch,
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
    const branch = normalizedInput.branch ?? get().activeBranchBySession[key] ?? 'main';
    const requestInput: ChatPromptInput = {
      ...normalizedInput,
      branch,
    };
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
    let streamBranch = branch;
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
        requestInput,
        {
          onEvent: (eventName, data) => {
            if (eventName === 'ready') {
              const readyBranch = normalizeText((data as { branch?: string }).branch);
              if (readyBranch) {
                streamBranch = readyBranch;
                set((state) => ({
                  activeBranchBySession: {
                    ...state.activeBranchBySession,
                    [key]: readyBranch,
                  },
                }));
              }
            }

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
                    branch: streamBranch,
                    api: requestInput.api,
                    modelId: requestInput.modelId,
                    providerOptions: requestInput.providerOptions,
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

      await get().loadMessages({ session, branch: requestInput.branch, force: true });

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
