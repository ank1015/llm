'use client';

import { create } from 'zustand';

import type { SessionRef, SessionTreeResponse, TurnSettings } from '@/lib/contracts';
import type {
  AgentEvent,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  MessageNode,
  UserMessage,
} from '@ank1015/llm-sdk';

import {
  getSessionTree,
  streamConversation,
  streamEditConversation,
  streamRetryConversation,
} from '@/lib/client-api';
import { getVisiblePathNodes, sortMessageNodesChronologically } from '@/lib/messages/session-tree';

type PendingPrompt = {
  id: string;
  prompt: string;
  createdAt: number;
  status: 'pending' | 'failed';
  error?: string;
};

type StreamRequestContext = {
  sessionId: string;
  projectId: string;
  artifactId: string;
} & TurnSettings;

type RetryStreamInput = StreamRequestContext & {
  nodeId: string;
};

type EditStreamInput = StreamRequestContext & {
  nodeId: string;
  prompt: string;
};

type RewritePreparation = {
  initialParentId: string | null;
  pendingPromptText: string;
  placeholderMessageId: string;
  snapshot: MessageNode[];
  stagedMessages: MessageNode[];
};

type ChatStoreState = {
  activeSession: SessionRef | null;
  messagesBySession: Record<string, MessageNode[]>;
  messageTreesBySession: Record<string, MessageNode[]>;
  persistedLeafNodeIdBySession: Record<string, string | null>;
  visibleLeafNodeIdBySession: Record<string, string | null>;
  streamingAssistantBySession: Record<string, Omit<BaseAssistantMessage<Api>, 'message'> | null>;
  pendingPromptsBySession: Record<string, PendingPrompt[]>;
  agentEventsBySession: Record<string, AgentEvent[]>;
  isLoadingMessagesBySession: Record<string, boolean>;
  isStreamingBySession: Record<string, boolean>;
  errorsBySession: Record<string, string | null>;
  setActiveSession: (session: SessionRef | null) => void;
  clearSessionState: (session: SessionRef) => void;
  clearSessionError: (session: SessionRef) => void;
  setVisibleLeafNode: (input: { session?: SessionRef; leafNodeId: string }) => void;
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
  retryFromNode: (input: RetryStreamInput) => Promise<void>;
  editFromNode: (input: EditStreamInput) => Promise<void>;
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

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }

  return false;
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

  return sortMessageNodesChronologically(next);
}

function replaceOptimisticMessageNode(
  existing: MessageNode[],
  placeholderMessageId: string,
  incoming: MessageNode
): MessageNode[] {
  const next = [...existing];
  const index = next.findIndex((node) => node.message.id === placeholderMessageId);

  if (index === -1) {
    next.push(incoming);
  } else {
    next[index] = incoming;
  }

  return sortMessageNodesChronologically(next);
}

function createOptimisticNode(input: {
  message: Message;
  parentId: string | null;
  api: Api;
  modelId: string;
  branch?: string;
}): MessageNode {
  return {
    type: 'message',
    id: `optimistic:${input.message.id}`,
    parentId: input.parentId,
    branch: input.branch ?? 'main',
    timestamp: toIsoTimestamp(input.message.timestamp),
    message: input.message,
    api: input.api,
    modelId: input.modelId,
    providerOptions: {},
  };
}

function getTextFromUserMessage(message: UserMessage): string {
  return message.content
    .filter((block): block is Extract<UserMessage['content'][number], { type: 'text' }> => {
      return block.type === 'text';
    })
    .map((block) => block.content)
    .join('\n');
}

function createOptimisticUserMessage(message: UserMessage, textOverride?: string): UserMessage {
  if (textOverride === undefined) {
    return {
      ...message,
      id: `optimistic:${message.id}`,
      timestamp: Date.now(),
    };
  }

  const nonTextBlocks = message.content.filter((block) => block.type !== 'text');
  const nextContent =
    textOverride.length > 0
      ? [{ type: 'text' as const, content: textOverride }, ...nonTextBlocks]
      : nonTextBlocks;

  return {
    ...message,
    id: `optimistic:${message.id}:edit`,
    timestamp: Date.now(),
    content: nextContent,
  };
}

function prepareRewriteState(input: {
  messages: MessageNode[];
  nodeId: string;
  api: Api;
  modelId: string;
  textOverride?: string;
}): RewritePreparation {
  const targetIndex = input.messages.findIndex((node) => node.id === input.nodeId);
  if (targetIndex === -1) {
    throw new Error('Message to rewrite was not found in the visible thread.');
  }

  const targetNode = input.messages[targetIndex];
  if (!targetNode || targetNode.message.role !== 'user') {
    throw new Error('Only user messages can be edited or retried.');
  }

  const baseMessages = input.messages.slice(0, targetIndex);
  const initialParentId = baseMessages.at(-1)?.id ?? null;
  const placeholderMessage = createOptimisticUserMessage(
    targetNode.message as UserMessage,
    input.textOverride
  );
  const placeholderNode = createOptimisticNode({
    message: placeholderMessage,
    parentId: initialParentId,
    api: input.api,
    modelId: input.modelId,
    branch: targetNode.branch,
  });
  const promptText = (
    input.textOverride ?? getTextFromUserMessage(targetNode.message as UserMessage)
  )
    .trim()
    .replace(/\s+/g, ' ');

  return {
    initialParentId,
    pendingPromptText: promptText.length > 0 ? promptText : 'Rewrite message',
    placeholderMessageId: placeholderMessage.id,
    snapshot: input.messages,
    stagedMessages: [...baseMessages, placeholderNode],
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

function getCurrentVisibleLeafNodeId(state: ChatStoreState, key: string): string | null {
  return state.visibleLeafNodeIdBySession[key] ?? state.persistedLeafNodeIdBySession[key] ?? null;
}

function deriveVisibleMessages(nodes: MessageNode[], leafNodeId: string | null): MessageNode[] {
  return getVisiblePathNodes(nodes, leafNodeId);
}

function applyLoadedTreeState(tree: SessionTreeResponse): {
  allNodes: MessageNode[];
  persistedLeafNodeId: string | null;
  visibleLeafNodeId: string | null;
  visibleMessages: MessageNode[];
} {
  const allNodes = sortMessageNodesChronologically(tree.nodes);
  const persistedLeafNodeId = tree.persistedLeafNodeId;
  const visibleLeafNodeId = persistedLeafNodeId;

  return {
    allNodes,
    persistedLeafNodeId,
    visibleLeafNodeId,
    visibleMessages: deriveVisibleMessages(allNodes, visibleLeafNodeId),
  };
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  activeSession: null,
  messagesBySession: {},
  messageTreesBySession: {},
  persistedLeafNodeIdBySession: {},
  visibleLeafNodeIdBySession: {},
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
      messageTreesBySession: {
        ...state.messageTreesBySession,
        [key]: state.messageTreesBySession[key] ?? [],
      },
      persistedLeafNodeIdBySession: {
        ...state.persistedLeafNodeIdBySession,
        [key]: state.persistedLeafNodeIdBySession[key] ?? null,
      },
      visibleLeafNodeIdBySession: {
        ...state.visibleLeafNodeIdBySession,
        [key]: state.visibleLeafNodeIdBySession[key] ?? null,
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
      streamingAssistantBySession: {
        ...state.streamingAssistantBySession,
        [key]: null,
      },
      messagesBySession: {
        ...state.messagesBySession,
        [key]: [],
      },
      messageTreesBySession: {
        ...state.messageTreesBySession,
        [key]: [],
      },
      persistedLeafNodeIdBySession: {
        ...state.persistedLeafNodeIdBySession,
        [key]: null,
      },
      visibleLeafNodeIdBySession: {
        ...state.visibleLeafNodeIdBySession,
        [key]: null,
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

  setVisibleLeafNode: ({ session, leafNodeId }) => {
    const resolvedSession = resolveSession({
      activeSession: get().activeSession,
      session,
    });
    const key = getSessionKey(resolvedSession);

    set((state) => {
      const treeNodes = state.messageTreesBySession[key] ?? [];
      if (!treeNodes.some((node) => node.id === leafNodeId)) {
        return state;
      }

      return {
        visibleLeafNodeIdBySession: {
          ...state.visibleLeafNodeIdBySession,
          [key]: leafNodeId,
        },
        messagesBySession: {
          ...state.messagesBySession,
          [key]: deriveVisibleMessages(treeNodes, leafNodeId),
        },
      };
    });
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
      const tree = await getSessionTree(ctx, session.sessionId);

      if ((messageLoadRequestIds.get(key) ?? 0) !== nextRequestId) {
        return;
      }

      const loadedState = applyLoadedTreeState(tree);

      set((state) => ({
        messageTreesBySession: {
          ...state.messageTreesBySession,
          [key]: loadedState.allNodes,
        },
        persistedLeafNodeIdBySession: {
          ...state.persistedLeafNodeIdBySession,
          [key]: loadedState.persistedLeafNodeId,
        },
        visibleLeafNodeIdBySession: {
          ...state.visibleLeafNodeIdBySession,
          [key]: loadedState.visibleLeafNodeId,
        },
        messagesBySession: {
          ...state.messagesBySession,
          [key]: loadedState.visibleMessages,
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
    const visibleLeafNodeId = getCurrentVisibleLeafNodeId(get(), key) ?? undefined;
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
          ...(visibleLeafNodeId ? { leafNodeId: visibleLeafNodeId } : {}),
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

  retryFromNode: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
    const key = getSessionKey(session);

    if (get().isStreamingBySession[key]) {
      throw new Error('A stream is already running for this session.');
    }

    const rewrite = prepareRewriteState({
      messages: get().messagesBySession[key] ?? [],
      nodeId: input.nodeId,
      api: input.api,
      modelId: input.modelId,
    });

    streamAbortControllers.get(key)?.abort();

    const pending = createPendingPrompt(rewrite.pendingPromptText);
    const controller = new AbortController();
    streamAbortControllers.set(key, controller);
    const visibleLeafNodeId = getCurrentVisibleLeafNodeId(get(), key) ?? undefined;
    let optimisticParentId = rewrite.initialParentId;
    let placeholderMessageId: string | null = rewrite.placeholderMessageId;
    let didPersistAnyMessage = false;

    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [key]: rewrite.stagedMessages,
      },
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
      await streamRetryConversation(
        {
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          projectId: input.projectId,
          artifactId: input.artifactId,
          api: input.api,
          modelId: input.modelId,
          reasoningLevel: input.reasoningLevel,
          ...(visibleLeafNodeId ? { leafNodeId: visibleLeafNodeId } : {}),
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
                  didPersistAnyMessage = true;
                  const optimisticNode = createOptimisticNode({
                    message: agentEvent.message,
                    parentId: optimisticParentId,
                    api: input.api,
                    modelId: input.modelId,
                  });

                  optimisticParentId = optimisticNode.id;

                  const nextMessages =
                    placeholderMessageId && agentEvent.messageType === 'user'
                      ? replaceOptimisticMessageNode(
                          state.messagesBySession[key] ?? [],
                          placeholderMessageId,
                          optimisticNode
                        )
                      : upsertOptimisticMessageNode(
                          state.messagesBySession[key] ?? [],
                          optimisticNode
                        );

                  if (agentEvent.messageType === 'user') {
                    placeholderMessageId = null;
                  }

                  nextState.messagesBySession = {
                    ...state.messagesBySession,
                    [key]: nextMessages,
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
      const aborted = controller.signal.aborted || isAbortError(error);
      const message = getErrorMessage(error);

      if (didPersistAnyMessage) {
        try {
          await get().loadMessages({
            session,
            projectId: input.projectId,
            artifactId: input.artifactId,
            force: true,
          });
        } catch {
          // Keep the optimistic thread if reload fails.
        }

        set((state) => ({
          pendingPromptsBySession: removePendingPrompt(
            state.pendingPromptsBySession,
            key,
            pending.id
          ),
          errorsBySession: {
            ...state.errorsBySession,
            [key]: aborted ? null : message,
          },
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
          },
        }));
      } else if (aborted) {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [key]: rewrite.snapshot,
          },
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
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [key]: rewrite.snapshot,
          },
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

  editFromNode: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
    const key = getSessionKey(session);
    const prompt = input.prompt.trim();

    if (prompt.length === 0) {
      throw new Error('Prompt cannot be empty.');
    }

    if (get().isStreamingBySession[key]) {
      throw new Error('A stream is already running for this session.');
    }

    const rewrite = prepareRewriteState({
      messages: get().messagesBySession[key] ?? [],
      nodeId: input.nodeId,
      api: input.api,
      modelId: input.modelId,
      textOverride: prompt,
    });

    streamAbortControllers.get(key)?.abort();

    const pending = createPendingPrompt(prompt);
    const controller = new AbortController();
    streamAbortControllers.set(key, controller);
    const visibleLeafNodeId = getCurrentVisibleLeafNodeId(get(), key) ?? undefined;
    let optimisticParentId = rewrite.initialParentId;
    let placeholderMessageId: string | null = rewrite.placeholderMessageId;
    let didPersistAnyMessage = false;

    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [key]: rewrite.stagedMessages,
      },
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
      await streamEditConversation(
        {
          sessionId: input.sessionId,
          nodeId: input.nodeId,
          message: prompt,
          projectId: input.projectId,
          artifactId: input.artifactId,
          api: input.api,
          modelId: input.modelId,
          reasoningLevel: input.reasoningLevel,
          ...(visibleLeafNodeId ? { leafNodeId: visibleLeafNodeId } : {}),
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
                  didPersistAnyMessage = true;
                  const optimisticNode = createOptimisticNode({
                    message: agentEvent.message,
                    parentId: optimisticParentId,
                    api: input.api,
                    modelId: input.modelId,
                  });

                  optimisticParentId = optimisticNode.id;

                  const nextMessages =
                    placeholderMessageId && agentEvent.messageType === 'user'
                      ? replaceOptimisticMessageNode(
                          state.messagesBySession[key] ?? [],
                          placeholderMessageId,
                          optimisticNode
                        )
                      : upsertOptimisticMessageNode(
                          state.messagesBySession[key] ?? [],
                          optimisticNode
                        );

                  if (agentEvent.messageType === 'user') {
                    placeholderMessageId = null;
                  }

                  nextState.messagesBySession = {
                    ...state.messagesBySession,
                    [key]: nextMessages,
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
      const aborted = controller.signal.aborted || isAbortError(error);
      const message = getErrorMessage(error);

      if (didPersistAnyMessage) {
        try {
          await get().loadMessages({
            session,
            projectId: input.projectId,
            artifactId: input.artifactId,
            force: true,
          });
        } catch {
          // Keep the optimistic thread if reload fails.
        }

        set((state) => ({
          pendingPromptsBySession: removePendingPrompt(
            state.pendingPromptsBySession,
            key,
            pending.id
          ),
          errorsBySession: {
            ...state.errorsBySession,
            [key]: aborted ? null : message,
          },
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
          },
        }));
      } else if (aborted) {
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [key]: rewrite.snapshot,
          },
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
        set((state) => ({
          messagesBySession: {
            ...state.messagesBySession,
            [key]: rewrite.snapshot,
          },
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

export type { EditStreamInput, PendingPrompt, RetryStreamInput, SessionRef };
