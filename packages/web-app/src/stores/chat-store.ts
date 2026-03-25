'use client';

import { create } from 'zustand';

import type {
  LiveRunSummaryDto,
  SessionRef,
  SessionTreeResponse,
  StreamAgentEventData,
  StreamDoneEventData,
  StreamErrorEventData,
  StreamNodePersistedEventData,
  StreamReadyEventData,
  TurnSettings,
} from '@/lib/client-api';
import type {
  AgentEvent,
  Attachment,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  MessageNode,
  UserMessage,
} from '@ank1015/llm-types';

import {
  attachToSessionRun,
  cancelSessionRun,
  getSessionTree,
  StreamConflictError,
  streamConversation,
  streamEditConversation,
  streamRetryConversation,
} from '@/lib/client-api';
import { getVisiblePathNodes, sortMessageNodesChronologically } from '@/lib/messages/session-tree';
import { getTextFromUserMessage, rewriteUserMessageText } from '@/lib/messages/utils';

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

const EMPTY_PROMPT_ERROR_MESSAGE = 'Prompt cannot be empty.';
const STREAM_ALREADY_RUNNING_ERROR_MESSAGE = 'A stream is already running for this session.';

type ChatStoreState = {
  activeSession: SessionRef | null;
  messagesBySession: Record<string, MessageNode[]>;
  messageTreesBySession: Record<string, MessageNode[]>;
  persistedLeafNodeIdBySession: Record<string, string | null>;
  visibleLeafNodeIdBySession: Record<string, string | null>;
  liveRunBySession: Record<string, LiveRunSummaryDto | null>;
  lastSeqBySession: Record<string, number>;
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
  attachToLiveRun: (input: {
    sessionId: string;
    projectId: string;
    artifactId: string;
    runId: string;
    afterSeq?: number;
    resetReplay?: boolean;
  }) => Promise<void>;
  startStream: (
    input: {
      sessionId: string;
      prompt: string;
      projectId: string;
      artifactId: string;
      attachments?: Attachment[];
    } & TurnSettings
  ) => Promise<void>;
  retryFromNode: (input: RetryStreamInput) => Promise<void>;
  editFromNode: (input: EditStreamInput) => Promise<void>;
  abortStream: (input: {
    session: SessionRef;
    projectId: string;
    artifactId: string;
  }) => Promise<void>;
};

const MAX_AGENT_EVENTS = 200;
const RECONNECT_DELAY_MS = 750;

const messageLoadRequestIds = new Map<string, number>();
const streamAbortControllers = new Map<
  string,
  {
    runId: string;
    controller: AbortController;
  }
>();
const streamReconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

function getPendingPromptLabel(prompt: string, attachments?: Attachment[]): string {
  const trimmed = prompt.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  if (!attachments || attachments.length === 0) {
    return '';
  }

  if (attachments.length === 1) {
    return attachments[0]?.fileName ?? 'Attachment';
  }

  return `${attachments.length} attachments`;
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
  } else if (next[index]?.id.startsWith('optimistic:')) {
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

function upsertPersistedMessageNode(existing: MessageNode[], incoming: MessageNode): MessageNode[] {
  const next = [...existing];
  const index = next.findIndex(
    (node) => node.id === incoming.id || node.message.id === incoming.message.id
  );

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

function createOptimisticUserMessage(message: UserMessage, textOverride?: string): UserMessage {
  if (textOverride === undefined) {
    return {
      ...message,
      id: `optimistic:${message.id}`,
      timestamp: Date.now(),
    };
  }

  return rewriteUserMessageText(message, textOverride);
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
  liveRun: LiveRunSummaryDto | null;
} {
  const allNodes = sortMessageNodesChronologically(tree.nodes);
  const persistedLeafNodeId = tree.persistedLeafNodeId;
  const visibleLeafNodeId = persistedLeafNodeId;

  return {
    allNodes,
    persistedLeafNodeId,
    visibleLeafNodeId,
    visibleMessages: deriveVisibleMessages(allNodes, visibleLeafNodeId),
    liveRun: tree.liveRun ?? null,
  };
}

function clearReconnectTimer(key: string): void {
  const timer = streamReconnectTimers.get(key);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  streamReconnectTimers.delete(key);
}

function clearStreamAttachment(key: string): void {
  clearReconnectTimer(key);
  const connection = streamAbortControllers.get(key);
  if (!connection) {
    return;
  }

  connection.controller.abort();
  streamAbortControllers.delete(key);
}

function applyPersistedNodeToSessionState(
  state: ChatStoreState,
  key: string,
  node: MessageNode
): Pick<
  ChatStoreState,
  | 'messageTreesBySession'
  | 'messagesBySession'
  | 'persistedLeafNodeIdBySession'
  | 'visibleLeafNodeIdBySession'
> {
  const nextTree = upsertPersistedMessageNode(state.messageTreesBySession[key] ?? [], node);
  const nextLeafNodeId = node.id;

  return {
    messageTreesBySession: {
      ...state.messageTreesBySession,
      [key]: nextTree,
    },
    messagesBySession: {
      ...state.messagesBySession,
      [key]: deriveVisibleMessages(nextTree, nextLeafNodeId),
    },
    persistedLeafNodeIdBySession: {
      ...state.persistedLeafNodeIdBySession,
      [key]: nextLeafNodeId,
    },
    visibleLeafNodeIdBySession: {
      ...state.visibleLeafNodeIdBySession,
      [key]: nextLeafNodeId,
    },
  };
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  activeSession: null,
  messagesBySession: {},
  messageTreesBySession: {},
  persistedLeafNodeIdBySession: {},
  visibleLeafNodeIdBySession: {},
  liveRunBySession: {},
  lastSeqBySession: {},
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
      liveRunBySession: {
        ...state.liveRunBySession,
        [key]: state.liveRunBySession[key] ?? null,
      },
      lastSeqBySession: {
        ...state.lastSeqBySession,
        [key]: state.lastSeqBySession[key] ?? 0,
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

    clearStreamAttachment(key);

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
      liveRunBySession: {
        ...state.liveRunBySession,
        [key]: null,
      },
      lastSeqBySession: {
        ...state.lastSeqBySession,
        [key]: 0,
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
      const previousLiveRun = get().liveRunBySession[key] ?? null;
      const shouldResetReplay = previousLiveRun?.runId !== loadedState.liveRun?.runId;

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
        liveRunBySession: {
          ...state.liveRunBySession,
          [key]: loadedState.liveRun,
        },
        lastSeqBySession: {
          ...state.lastSeqBySession,
          [key]: shouldResetReplay || !loadedState.liveRun ? 0 : (state.lastSeqBySession[key] ?? 0),
        },
        streamingAssistantBySession: {
          ...state.streamingAssistantBySession,
          [key]:
            shouldResetReplay || !loadedState.liveRun
              ? null
              : (state.streamingAssistantBySession[key] ?? null),
        },
        agentEventsBySession: {
          ...state.agentEventsBySession,
          [key]:
            shouldResetReplay || !loadedState.liveRun
              ? []
              : (state.agentEventsBySession[key] ?? []),
        },
        isStreamingBySession: {
          ...state.isStreamingBySession,
          [key]: loadedState.liveRun?.status === 'running',
        },
        isLoadingMessagesBySession: {
          ...state.isLoadingMessagesBySession,
          [key]: false,
        },
      }));

      if (!loadedState.liveRun || loadedState.liveRun.status !== 'running') {
        clearStreamAttachment(key);
        return;
      }

      void get().attachToLiveRun({
        sessionId: session.sessionId,
        projectId: ctx.projectId,
        artifactId: ctx.artifactId,
        runId: loadedState.liveRun.runId,
        afterSeq: shouldResetReplay ? 0 : (get().lastSeqBySession[key] ?? 0),
        resetReplay: shouldResetReplay,
      });
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

  attachToLiveRun: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
    const key = getSessionKey(session);
    const activeConnection = streamAbortControllers.get(key);

    if (activeConnection?.runId === input.runId) {
      return;
    }

    clearStreamAttachment(key);

    if (input.resetReplay) {
      set((state) => ({
        agentEventsBySession: {
          ...state.agentEventsBySession,
          [key]: [],
        },
        streamingAssistantBySession: {
          ...state.streamingAssistantBySession,
          [key]: null,
        },
        lastSeqBySession: {
          ...state.lastSeqBySession,
          [key]: 0,
        },
      }));
    }

    const controller = new AbortController();
    streamAbortControllers.set(key, {
      runId: input.runId,
      controller,
    });

    try {
      await attachToSessionRun(
        {
          sessionId: input.sessionId,
          projectId: input.projectId,
          artifactId: input.artifactId,
          runId: input.runId,
          afterSeq: input.afterSeq,
        },
        {
          onEvent: (eventName, data) => {
            if (eventName === 'ready') {
              const readyData = data as StreamReadyEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        runId: readyData.runId,
                        status: readyData.status,
                      }
                    : {
                        runId: readyData.runId,
                        mode: 'prompt',
                        status: readyData.status,
                        startedAt: new Date().toISOString(),
                      },
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: readyData.status === 'running',
                },
              }));
              return;
            }

            if (eventName === 'agent_event') {
              const payload = data as StreamAgentEventData;

              set((state) => {
                const existingEvents = state.agentEventsBySession[key] ?? [];
                const nextEvents = [...existingEvents, payload.event];

                if (nextEvents.length > MAX_AGENT_EVENTS) {
                  nextEvents.splice(0, nextEvents.length - MAX_AGENT_EVENTS);
                }

                const nextState: Partial<ChatStoreState> = {
                  agentEventsBySession: {
                    ...state.agentEventsBySession,
                    [key]: nextEvents,
                  },
                  lastSeqBySession: {
                    ...state.lastSeqBySession,
                    [key]: Math.max(state.lastSeqBySession[key] ?? 0, payload.seq),
                  },
                };

                if (
                  payload.event.type === 'message_update' &&
                  payload.event.messageType === 'assistant'
                ) {
                  const streamingAssistant = getStreamingAssistantMessage(payload.event.message);
                  if (streamingAssistant) {
                    nextState.streamingAssistantBySession = {
                      ...state.streamingAssistantBySession,
                      [key]: streamingAssistant,
                    };
                  }
                }

                if (
                  payload.event.type === 'message_end' &&
                  payload.event.messageType === 'assistant'
                ) {
                  nextState.streamingAssistantBySession = {
                    ...state.streamingAssistantBySession,
                    [key]: null,
                  };
                }

                return nextState;
              });
              return;
            }

            if (eventName === 'node_persisted') {
              const payload = data as StreamNodePersistedEventData;

              set((state) => ({
                ...applyPersistedNodeToSessionState(state, key, payload.node),
                lastSeqBySession: {
                  ...state.lastSeqBySession,
                  [key]: Math.max(state.lastSeqBySession[key] ?? 0, payload.seq),
                },
              }));
              return;
            }

            if (eventName === 'done') {
              const doneData = data as StreamDoneEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: doneData.status,
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
                },
                streamingAssistantBySession: {
                  ...state.streamingAssistantBySession,
                  [key]: null,
                },
              }));

              void get().loadMessages({
                session,
                projectId: input.projectId,
                artifactId: input.artifactId,
                force: true,
              });
              return;
            }

            if (eventName === 'error') {
              const errorData = data as StreamErrorEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: 'failed',
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
                },
                errorsBySession: {
                  ...state.errorsBySession,
                  [key]: errorData.message,
                },
                streamingAssistantBySession: {
                  ...state.streamingAssistantBySession,
                  [key]: null,
                },
              }));

              void get().loadMessages({
                session,
                projectId: input.projectId,
                artifactId: input.artifactId,
                force: true,
              });
            }
          },
        },
        controller.signal
      );
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }

      const liveRun = get().liveRunBySession[key];
      if (liveRun?.runId === input.runId && liveRun.status === 'running') {
        clearReconnectTimer(key);
        const reconnectTimer = setTimeout(() => {
          streamReconnectTimers.delete(key);
          void get().attachToLiveRun({
            sessionId: input.sessionId,
            projectId: input.projectId,
            artifactId: input.artifactId,
            runId: input.runId,
            afterSeq: get().lastSeqBySession[key] ?? 0,
            resetReplay: false,
          });
        }, RECONNECT_DELAY_MS);
        streamReconnectTimers.set(key, reconnectTimer);
        return;
      }

      set((state) => ({
        errorsBySession: {
          ...state.errorsBySession,
          [key]: getErrorMessage(error),
        },
      }));
    } finally {
      const active = streamAbortControllers.get(key);
      if (active?.runId === input.runId && active.controller === controller) {
        streamAbortControllers.delete(key);
      }
    }
  },

  startStream: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
    const key = getSessionKey(session);
    const prompt = input.prompt.trim();
    const attachments = input.attachments ?? [];

    if (prompt.length === 0 && attachments.length === 0) {
      throw new Error(EMPTY_PROMPT_ERROR_MESSAGE);
    }

    if (get().isStreamingBySession[key]) {
      throw new Error(STREAM_ALREADY_RUNNING_ERROR_MESSAGE);
    }

    clearStreamAttachment(key);

    const pending = createPendingPrompt(getPendingPromptLabel(prompt, attachments));
    const controller = new AbortController();
    streamAbortControllers.set(key, {
      runId: `pending:${pending.id}`,
      controller,
    });
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
      liveRunBySession: {
        ...state.liveRunBySession,
        [key]: {
          runId: `pending:${pending.id}`,
          mode: 'prompt',
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      },
      lastSeqBySession: {
        ...state.lastSeqBySession,
        [key]: 0,
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
          ...(attachments.length > 0 ? { attachments } : {}),
          projectId: input.projectId,
          artifactId: input.artifactId,
          api: input.api,
          modelId: input.modelId,
          reasoningLevel: input.reasoningLevel,
          ...(visibleLeafNodeId ? { leafNodeId: visibleLeafNodeId } : {}),
        },
        {
          onEvent: (eventName, data) => {
            if (eventName === 'ready') {
              const readyData = data as StreamReadyEventData;

              streamAbortControllers.set(key, {
                runId: readyData.runId,
                controller,
              });

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: {
                    ...(state.liveRunBySession[key] ?? {
                      mode: 'prompt' as const,
                      startedAt: new Date().toISOString(),
                    }),
                    runId: readyData.runId,
                    status: readyData.status,
                    mode: 'prompt',
                  },
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: readyData.status === 'running',
                },
              }));
              return;
            }

            if (eventName === 'agent_event') {
              const payload = data as StreamAgentEventData;
              const agentEvent = payload.event;

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
                  lastSeqBySession: {
                    ...state.lastSeqBySession,
                    [key]: Math.max(state.lastSeqBySession[key] ?? 0, payload.seq),
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
              return;
            }

            if (eventName === 'node_persisted') {
              const payload = data as StreamNodePersistedEventData;

              set((state) => ({
                ...applyPersistedNodeToSessionState(state, key, payload.node),
                lastSeqBySession: {
                  ...state.lastSeqBySession,
                  [key]: Math.max(state.lastSeqBySession[key] ?? 0, payload.seq),
                },
              }));
              return;
            }

            if (eventName === 'error') {
              const errorData = data as StreamErrorEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: 'failed',
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                errorsBySession: {
                  ...state.errorsBySession,
                  [key]: errorData.message,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
                },
                streamingAssistantBySession: {
                  ...state.streamingAssistantBySession,
                  [key]: null,
                },
              }));
              return;
            }

            if (eventName === 'done') {
              const doneData = data as StreamDoneEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: doneData.status,
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
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
      if (error instanceof StreamConflictError) {
        set((state) => ({
          pendingPromptsBySession: removePendingPrompt(
            state.pendingPromptsBySession,
            key,
            pending.id
          ),
          liveRunBySession: {
            ...state.liveRunBySession,
            [key]: error.liveRun,
          },
          isStreamingBySession: {
            ...state.isStreamingBySession,
            [key]: error.liveRun.status === 'running',
          },
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
          },
        }));

        clearStreamAttachment(key);
        void get().attachToLiveRun({
          sessionId: input.sessionId,
          projectId: input.projectId,
          artifactId: input.artifactId,
          runId: error.liveRun.runId,
          afterSeq: 0,
          resetReplay: true,
        });
        return;
      }

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
          liveRunBySession: {
            ...state.liveRunBySession,
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
          liveRunBySession: {
            ...state.liveRunBySession,
            [key]: null,
          },
        }));
      }

      throw error;
    } finally {
      const active = streamAbortControllers.get(key);
      if (active?.controller === controller) {
        streamAbortControllers.delete(key);
      }

      set((state) => ({
        isStreamingBySession: {
          ...state.isStreamingBySession,
          [key]: state.liveRunBySession[key]?.status === 'running',
        },
      }));
    }
  },

  retryFromNode: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
    const key = getSessionKey(session);

    if (get().isStreamingBySession[key]) {
      throw new Error(STREAM_ALREADY_RUNNING_ERROR_MESSAGE);
    }

    const rewrite = prepareRewriteState({
      messages: get().messagesBySession[key] ?? [],
      nodeId: input.nodeId,
      api: input.api,
      modelId: input.modelId,
    });

    clearStreamAttachment(key);

    const pending = createPendingPrompt(rewrite.pendingPromptText);
    const controller = new AbortController();
    streamAbortControllers.set(key, {
      runId: `pending:${pending.id}`,
      controller,
    });
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
      liveRunBySession: {
        ...state.liveRunBySession,
        [key]: {
          runId: `pending:${pending.id}`,
          mode: 'retry',
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      },
      lastSeqBySession: {
        ...state.lastSeqBySession,
        [key]: 0,
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
            if (eventName === 'ready') {
              const readyData = data as StreamReadyEventData;

              streamAbortControllers.set(key, {
                runId: readyData.runId,
                controller,
              });

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: {
                    ...(state.liveRunBySession[key] ?? {
                      mode: 'retry' as const,
                      startedAt: new Date().toISOString(),
                    }),
                    runId: readyData.runId,
                    status: readyData.status,
                    mode: 'retry',
                  },
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: readyData.status === 'running',
                },
              }));
              return;
            }

            if (eventName === 'agent_event') {
              const payload = data as StreamAgentEventData;
              const agentEvent = payload.event;

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
                  lastSeqBySession: {
                    ...state.lastSeqBySession,
                    [key]: Math.max(state.lastSeqBySession[key] ?? 0, payload.seq),
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
              return;
            }

            if (eventName === 'node_persisted') {
              const persistedData = data as StreamNodePersistedEventData;

              didPersistAnyMessage = true;
              optimisticParentId = persistedData.node.id;
              if (persistedData.node.message.role === 'user') {
                placeholderMessageId = null;
              }

              set((state) => ({
                ...applyPersistedNodeToSessionState(state, key, persistedData.node),
                lastSeqBySession: {
                  ...state.lastSeqBySession,
                  [key]: Math.max(state.lastSeqBySession[key] ?? 0, persistedData.seq),
                },
              }));
              return;
            }

            if (eventName === 'error') {
              const errorData = data as StreamErrorEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: 'failed',
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                errorsBySession: {
                  ...state.errorsBySession,
                  [key]: errorData.message,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
                },
                streamingAssistantBySession: {
                  ...state.streamingAssistantBySession,
                  [key]: null,
                },
              }));
              return;
            }

            if (eventName === 'done') {
              const doneData = data as StreamDoneEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: doneData.status,
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
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
      if (error instanceof StreamConflictError) {
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
          liveRunBySession: {
            ...state.liveRunBySession,
            [key]: error.liveRun,
          },
          isStreamingBySession: {
            ...state.isStreamingBySession,
            [key]: error.liveRun.status === 'running',
          },
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
          },
        }));

        clearStreamAttachment(key);
        void get().attachToLiveRun({
          sessionId: input.sessionId,
          projectId: input.projectId,
          artifactId: input.artifactId,
          runId: error.liveRun.runId,
          afterSeq: 0,
          resetReplay: true,
        });
        return;
      }

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
          liveRunBySession: {
            ...state.liveRunBySession,
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
          liveRunBySession: {
            ...state.liveRunBySession,
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
          liveRunBySession: {
            ...state.liveRunBySession,
            [key]: null,
          },
        }));
      }

      throw error;
    } finally {
      const active = streamAbortControllers.get(key);
      if (active?.controller === controller) {
        streamAbortControllers.delete(key);
      }

      set((state) => ({
        isStreamingBySession: {
          ...state.isStreamingBySession,
          [key]: state.liveRunBySession[key]?.status === 'running',
        },
      }));
    }
  },

  editFromNode: async (input) => {
    const session: SessionRef = { sessionId: input.sessionId };
    const key = getSessionKey(session);
    const prompt = input.prompt.trim();

    if (prompt.length === 0) {
      throw new Error(EMPTY_PROMPT_ERROR_MESSAGE);
    }

    if (get().isStreamingBySession[key]) {
      throw new Error(STREAM_ALREADY_RUNNING_ERROR_MESSAGE);
    }

    const rewrite = prepareRewriteState({
      messages: get().messagesBySession[key] ?? [],
      nodeId: input.nodeId,
      api: input.api,
      modelId: input.modelId,
      textOverride: prompt,
    });

    clearStreamAttachment(key);

    const pending = createPendingPrompt(prompt);
    const controller = new AbortController();
    streamAbortControllers.set(key, {
      runId: `pending:${pending.id}`,
      controller,
    });
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
      liveRunBySession: {
        ...state.liveRunBySession,
        [key]: {
          runId: `pending:${pending.id}`,
          mode: 'edit',
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      },
      lastSeqBySession: {
        ...state.lastSeqBySession,
        [key]: 0,
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
            if (eventName === 'ready') {
              const readyData = data as StreamReadyEventData;

              streamAbortControllers.set(key, {
                runId: readyData.runId,
                controller,
              });

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: {
                    ...(state.liveRunBySession[key] ?? {
                      mode: 'edit' as const,
                      startedAt: new Date().toISOString(),
                    }),
                    runId: readyData.runId,
                    status: readyData.status,
                    mode: 'edit',
                  },
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: readyData.status === 'running',
                },
              }));
              return;
            }

            if (eventName === 'agent_event') {
              const payload = data as StreamAgentEventData;
              const agentEvent = payload.event;

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
                  lastSeqBySession: {
                    ...state.lastSeqBySession,
                    [key]: Math.max(state.lastSeqBySession[key] ?? 0, payload.seq),
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
              return;
            }

            if (eventName === 'node_persisted') {
              const persistedData = data as StreamNodePersistedEventData;

              didPersistAnyMessage = true;
              optimisticParentId = persistedData.node.id;
              if (persistedData.node.message.role === 'user') {
                placeholderMessageId = null;
              }

              set((state) => ({
                ...applyPersistedNodeToSessionState(state, key, persistedData.node),
                lastSeqBySession: {
                  ...state.lastSeqBySession,
                  [key]: Math.max(state.lastSeqBySession[key] ?? 0, persistedData.seq),
                },
              }));
              return;
            }

            if (eventName === 'error') {
              const errorData = data as StreamErrorEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: 'failed',
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                errorsBySession: {
                  ...state.errorsBySession,
                  [key]: errorData.message,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
                },
                streamingAssistantBySession: {
                  ...state.streamingAssistantBySession,
                  [key]: null,
                },
              }));
              return;
            }

            if (eventName === 'done') {
              const doneData = data as StreamDoneEventData;

              set((state) => ({
                liveRunBySession: {
                  ...state.liveRunBySession,
                  [key]: state.liveRunBySession[key]
                    ? {
                        ...state.liveRunBySession[key],
                        status: doneData.status,
                        finishedAt: new Date().toISOString(),
                      }
                    : null,
                },
                isStreamingBySession: {
                  ...state.isStreamingBySession,
                  [key]: false,
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
      if (error instanceof StreamConflictError) {
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
          liveRunBySession: {
            ...state.liveRunBySession,
            [key]: error.liveRun,
          },
          isStreamingBySession: {
            ...state.isStreamingBySession,
            [key]: error.liveRun.status === 'running',
          },
          streamingAssistantBySession: {
            ...state.streamingAssistantBySession,
            [key]: null,
          },
        }));

        clearStreamAttachment(key);
        void get().attachToLiveRun({
          sessionId: input.sessionId,
          projectId: input.projectId,
          artifactId: input.artifactId,
          runId: error.liveRun.runId,
          afterSeq: 0,
          resetReplay: true,
        });
        return;
      }

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
          liveRunBySession: {
            ...state.liveRunBySession,
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
          liveRunBySession: {
            ...state.liveRunBySession,
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
          liveRunBySession: {
            ...state.liveRunBySession,
            [key]: null,
          },
        }));
      }

      throw error;
    } finally {
      const active = streamAbortControllers.get(key);
      if (active?.controller === controller) {
        streamAbortControllers.delete(key);
      }

      set((state) => ({
        isStreamingBySession: {
          ...state.isStreamingBySession,
          [key]: state.liveRunBySession[key]?.status === 'running',
        },
      }));
    }
  },

  abortStream: async ({ session, projectId, artifactId }) => {
    const key = getSessionKey(session);
    const liveRun = get().liveRunBySession[key];

    if (!liveRun?.runId || liveRun.status !== 'running') {
      return;
    }

    await cancelSessionRun({
      sessionId: session.sessionId,
      projectId,
      artifactId,
      runId: liveRun.runId,
    });
  },
}));

export type { EditStreamInput, PendingPrompt, RetryStreamInput, SessionRef };
