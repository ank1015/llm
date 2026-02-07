/**
 * Conversation class for managing stateful agent interactions.
 *
 * Uses core's runAgentLoop for execution with optional adapter support
 * for API key resolution and usage tracking.
 */

import {
  generateUUID,
  runAgentLoop,
  buildUserMessage,
  complete as coreComplete,
  stream as coreStream,
} from '@ank1015/llm-core';
import {
  ConversationBusyError,
  CostLimitError,
  ModelNotConfiguredError,
  SessionNotFoundError,
} from '@ank1015/llm-types';

import { resolveApiKey } from '../utils/resolve-key.js';

import type { KeysAdapter, UsageAdapter, SessionsAdapter } from '../adapters/index.js';
import type { AgentRunnerCallbacks, AgentRunnerConfig } from '@ank1015/llm-core';
import type {
  Api,
  CustomMessage,
  Message,
  AgentEvent,
  AgentState,
  Attachment,
  OptionsForApi,
  Provider,
  QueuedMessage,
  AgentTool,
} from '@ank1015/llm-types';

/**
 * Configuration for optional session persistence.
 */
export interface ConversationSessionConfig {
  /** Project name for the session */
  projectName: string;
  /** Path within the project (default: '') */
  path?: string;
  /** Session ID to resume — omit to auto-create on first message */
  sessionId?: string;
  /** Session name used when auto-creating (ignored if sessionId is provided) */
  sessionName?: string;
  /** Branch name (default: 'main') */
  branch?: string;
}

export interface ConversationOptions {
  /** Initial state for the conversation */
  initialState?: Partial<AgentState>;
  /** Transform messages before sending to LLM */
  messageTransformer?: (messages: Message[]) => Message[] | Promise<Message[]>;
  /** Queue mode: "all" = send all queued messages at once, "one-at-a-time" = send one per turn */
  queueMode?: 'all' | 'one-at-a-time';
  /** Adapter for retrieving API keys */
  keysAdapter?: KeysAdapter;
  /** Adapter for tracking usage */
  usageAdapter?: UsageAdapter;
  /** Adapter for session persistence */
  sessionsAdapter?: SessionsAdapter;
  /** Optional session configuration (requires sessionsAdapter) */
  session?: ConversationSessionConfig;
  /** Optional cost limit */
  costLimit?: number;
  /** Optional context limit */
  contextLimit?: number;
  /** Whether to stream assistant messages (default: true) */
  streamAssistantMessage?: boolean;
}

export type ConversationExternalCallback = (message: Message) => void | Promise<void>;

/** Sentinel value indicating no provider has been configured yet. */
const NO_PROVIDER = null as unknown as Provider<Api>;

const defaultConversationState: AgentState = {
  provider: NO_PROVIDER,
  messages: [],
  tools: [],
  isStreaming: false,
  pendingToolCalls: new Set<string>(),
  usage: {
    totalTokens: 0,
    totalCost: 0,
    lastInputTokens: 0,
  },
};

const defaultMessageTransformer = (messages: Message[]): Message[] => {
  return messages.slice();
};

export class Conversation {
  private keysAdapter?: KeysAdapter;
  private usageAdapter?: UsageAdapter;
  private _state: AgentState = defaultConversationState;
  private listeners = new Set<(e: AgentEvent) => void>();
  private abortController?: AbortController;
  private messageTransformer: (messages: Message[]) => Message[] | Promise<Message[]>;
  private messageQueue: Array<QueuedMessage<Message>> = [];
  private queueMode: 'all' | 'one-at-a-time';
  private runningPrompt?: Promise<void>;
  private resolveRunningPrompt?: () => void;
  private streamAssistantMessage: boolean = true;
  private sessionConfig?: ConversationSessionConfig;
  private persistence?: {
    adapter: SessionsAdapter;
    projectName: string;
    path: string;
    sessionId?: string;
    branch: string;
    lastNodeId?: string;
  };
  private persistenceChain: Promise<void> = Promise.resolve();

  constructor(opts: ConversationOptions = {}) {
    const initialState = opts.initialState ?? {};
    if (opts.keysAdapter) {
      this.keysAdapter = opts.keysAdapter;
    }
    if (opts.usageAdapter) {
      this.usageAdapter = opts.usageAdapter;
    }
    this.streamAssistantMessage = opts.streamAssistantMessage ?? true;

    // Set up persistence if session config and adapter are provided
    if (opts.session && opts.sessionsAdapter) {
      this.sessionConfig = opts.session;
      const p: typeof this.persistence = {
        adapter: opts.sessionsAdapter,
        projectName: opts.session.projectName,
        path: opts.session.path ?? '',
        branch: opts.session.branch ?? 'main',
      };
      if (opts.session.sessionId) {
        p.sessionId = opts.session.sessionId;
      }
      this.persistence = p;
    }

    // Create fresh copies of reference types
    const state: AgentState = {
      ...defaultConversationState,
      ...initialState,
      messages: initialState.messages ? [...initialState.messages] : [],
      tools: initialState.tools ? [...initialState.tools] : [],
      pendingToolCalls: new Set(initialState.pendingToolCalls ?? []),
      usage: initialState.usage ? { ...initialState.usage } : { ...defaultConversationState.usage },
    };

    // Conditionally set optional properties
    const costLimit = opts.costLimit ?? initialState.costLimit;
    const contextLimit = opts.contextLimit ?? initialState.contextLimit;
    if (costLimit !== undefined) {
      state.costLimit = costLimit;
    }
    if (contextLimit !== undefined) {
      state.contextLimit = contextLimit;
    }
    this._state = state;
    this.messageTransformer = opts.messageTransformer || defaultMessageTransformer;
    this.queueMode = opts.queueMode || 'one-at-a-time';
  }

  get state(): AgentState {
    return this._state;
  }

  subscribe(fn: (e: AgentEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(e);
    }
  }

  setStreamAssistantMessage(stream: boolean): void {
    this.streamAssistantMessage = stream;
  }

  setCostLimit(limit: number): void {
    this._state.costLimit = limit;
  }

  getCostLimit(): number | undefined {
    return this._state.costLimit;
  }

  setContextLimit(limit: number): void {
    this._state.contextLimit = limit;
  }

  getContextLimit(): number | undefined {
    return this._state.contextLimit;
  }

  setSystemPrompt(v: string): void {
    this._state.systemPrompt = v;
  }

  setProvider<TApi extends Api>(provider: Provider<TApi>): void {
    this._state.provider = provider;
  }

  setQueueMode(mode: 'all' | 'one-at-a-time'): void {
    this.queueMode = mode;
  }

  getQueueMode(): 'all' | 'one-at-a-time' {
    return this.queueMode;
  }

  setTools(t: AgentTool[]): void {
    this._state.tools = t;
  }

  setKeysAdapter(adapter: KeysAdapter): void {
    this.keysAdapter = adapter;
  }

  setUsageAdapter(adapter: UsageAdapter): void {
    this.usageAdapter = adapter;
  }

  replaceMessages(ms: Message[]): void {
    this._state.messages = ms.slice();
  }

  appendMessage(m: Message): void {
    this._state.messages = [...this._state.messages, m];
    if (m.role === 'assistant') {
      this._state.usage.totalTokens = m.usage.totalTokens;
      this._state.usage.totalCost += m.usage.cost.total;
      this._state.usage.lastInputTokens = m.usage.input;
    }
  }

  appendMessages(ms: Message[]): void {
    this._state.messages = [...this._state.messages, ...ms];
    for (const m of ms) {
      if (m.role === 'assistant') {
        this._state.usage.totalTokens = m.usage.totalTokens;
        this._state.usage.totalCost += m.usage.cost.total;
        this._state.usage.lastInputTokens = m.usage.input;
      }
    }
  }

  async queueMessage(m: Message): Promise<void> {
    const transformed = await this.messageTransformer([m]);
    const queuedMessage: QueuedMessage<Message> = { original: m };
    if (transformed[0]) {
      queuedMessage.llm = transformed[0];
    }
    this.messageQueue.push(queuedMessage);
  }

  clearMessageQueue(): void {
    this.messageQueue = [];
  }

  clearMessages(): void {
    this._state.messages = [];
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  removeMessage(messageId: string): boolean {
    const index = this._state.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return false;
    this._state.messages = [
      ...this._state.messages.slice(0, index),
      ...this._state.messages.slice(index + 1),
    ];
    return true;
  }

  updateMessage(messageId: string, updater: (message: Message) => Message): boolean {
    const index = this._state.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return false;
    const currentMessage = this._state.messages[index];
    if (!currentMessage) return false;
    const updated = updater(currentMessage);
    this._state.messages = [
      ...this._state.messages.slice(0, index),
      updated,
      ...this._state.messages.slice(index + 1),
    ];
    return true;
  }

  abort(): void {
    this.abortController?.abort();
  }

  waitForIdle(): Promise<void> {
    return this.runningPrompt ?? Promise.resolve();
  }

  reset(): void {
    this.abortController?.abort();
    delete this.abortController;

    this.resolveRunningPrompt?.();
    delete this.runningPrompt;
    delete this.resolveRunningPrompt;

    this._state.messages = [];
    this._state.isStreaming = false;
    this._state.pendingToolCalls = new Set<string>();
    delete this._state.error;
    this.messageQueue = [];
  }

  private _cleanup(): void {
    this._state.isStreaming = false;
    this._state.pendingToolCalls.clear();
    delete this.abortController;
    this.resolveRunningPrompt?.();
    delete this.runningPrompt;
    delete this.resolveRunningPrompt;
  }

  async addCustomMessage(message: Record<string, unknown>): Promise<void> {
    const messageId = generateUUID();
    const customMessage: CustomMessage = {
      role: 'custom',
      id: messageId,
      content: message,
      timestamp: Date.now(),
    };
    this.emit({ type: 'message_start', messageId, messageType: 'custom', message: customMessage });
    this.emit({ type: 'message_update', messageId, messageType: 'custom', message: customMessage });
    await this.waitForIdle();
    this.appendMessage(customMessage);
    this.emit({ type: 'message_end', messageId, messageType: 'custom', message: customMessage });
  }

  async prompt(
    input: string,
    attachments?: Attachment[],
    externalCallback?: ConversationExternalCallback
  ): Promise<Message[]> {
    if (this._state.isStreaming) {
      throw new ConversationBusyError();
    }

    if (!this._state.provider || !this._state.provider.model) {
      throw new ModelNotConfiguredError();
    }

    const userMessage = buildUserMessage(input, attachments);
    const newMessages = await this._runAgentLoop(userMessage, externalCallback);
    return newMessages;
  }

  async continue(externalCallback?: ConversationExternalCallback): Promise<Message[]> {
    if (this._state.isStreaming) {
      throw new ConversationBusyError();
    }

    if (this._state.messages.length === 0) {
      throw new Error('No messages to continue from');
    }

    const newMessages = await this._runAgentLoopContinue(externalCallback);
    return newMessages;
  }

  /**
   * Resolve API key from provider options or adapter.
   */
  private async _resolveApiKey(): Promise<string> {
    const providerOptions = this._state.provider.providerOptions as
      | Record<string, unknown>
      | undefined;
    return resolveApiKey(this._state.provider.model.api, providerOptions, this.keysAdapter);
  }

  /**
   * Initialize persistence on first use: validate existing session or prepare for auto-creation.
   */
  private async initializePersistence(): Promise<void> {
    if (!this.persistence || this.persistence.lastNodeId) return;

    const { adapter, projectName, path, sessionId, branch } = this.persistence;

    if (sessionId) {
      const session = await adapter.getSession({ projectName, path, sessionId });
      if (!session) throw new SessionNotFoundError(sessionId);

      this.persistence.sessionId = sessionId;
      // Find the latest node on the current branch
      const branchNodes = session.nodes.filter((n) => n.branch === branch);
      const latest = branchNodes[branchNodes.length - 1];
      this.persistence.lastNodeId = latest?.id ?? session.header.id;
    }
  }

  /**
   * Persist a message to the session store.
   */
  private async persistMessage(message: Message): Promise<void> {
    if (!this.persistence) return;

    const { adapter, projectName, path, branch } = this.persistence;

    // Auto-create session on first message if no sessionId
    if (!this.persistence.sessionId) {
      const createInput: { projectName: string; path?: string; sessionName?: string } = {
        projectName,
      };
      if (path) createInput.path = path;
      if (this.sessionConfig?.sessionName) createInput.sessionName = this.sessionConfig.sessionName;
      const { sessionId, header } = await adapter.createSession(createInput);
      this.persistence.sessionId = sessionId;
      this.persistence.lastNodeId = header.id;
    }

    const parentId = this.persistence.lastNodeId!;

    const { node } = await adapter.appendMessage({
      projectName,
      path,
      sessionId: this.persistence.sessionId,
      parentId,
      branch,
      message,
      api: this._state.provider.model.api,
      modelId: this._state.provider.model.id,
    });

    this.persistence.lastNodeId = node.id;
  }

  /**
   * Queue a persistence operation. Errors are caught and stored for later inspection.
   */
  private queuePersistence(message: Message): void {
    this.persistenceChain = this.persistenceChain.then(() => this.persistMessage(message));
  }

  private async _prepareRun(): Promise<{
    llmMessages: Message[];
    cfg: AgentRunnerConfig;
    signal: AbortSignal;
  }> {
    if (!this._state.provider || !this._state.provider.model) {
      throw new ModelNotConfiguredError();
    }

    if (this._state.costLimit && this._state.usage.totalCost >= this._state.costLimit) {
      throw new CostLimitError(this._state.usage.totalCost, this._state.costLimit);
    }

    // Initialize persistence (validate session, load latest node)
    await this.initializePersistence();

    // Resolve API key before starting
    const apiKey = await this._resolveApiKey();

    this.runningPrompt = new Promise<void>((resolve) => {
      this.resolveRunningPrompt = resolve;
    });

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this._state.isStreaming = true;
    delete this._state.error;

    const budget: AgentRunnerConfig['budget'] = {
      currentCost: this._state.usage.totalCost,
    };
    if (this._state.costLimit !== undefined) {
      budget.costLimit = this._state.costLimit;
    }
    if (this._state.contextLimit !== undefined) {
      budget.contextLimit = this._state.contextLimit;
    }

    // Create bound complete/stream functions with API key
    const usageAdapter = this.usageAdapter;
    const boundComplete: AgentRunnerConfig['complete'] = async (m, ctx, opts, id) => {
      const result = await coreComplete(
        m,
        ctx,
        { ...opts, apiKey } as OptionsForApi<typeof m.api>,
        id
      );
      if (usageAdapter) {
        await usageAdapter.track(result);
      }
      return result;
    };

    const boundStream: AgentRunnerConfig['stream'] = (m, ctx, opts, id) => {
      const eventStream = coreStream(
        m,
        ctx,
        { ...opts, apiKey } as OptionsForApi<typeof m.api>,
        id
      );
      if (usageAdapter) {
        const originalResult = eventStream.result.bind(eventStream);
        eventStream.result = async () => {
          const message = await originalResult();
          await usageAdapter.track(message);
          return message;
        };
      }
      return eventStream;
    };

    const cfg: AgentRunnerConfig = {
      tools: this._state.tools,
      provider: this._state.provider,
      budget,
      complete: boundComplete,
      stream: boundStream,
      streamAssistantMessage: this.streamAssistantMessage,
      getQueuedMessages: async <T>() => {
        if (this.queueMode === 'one-at-a-time') {
          if (this.messageQueue.length > 0) {
            const first = this.messageQueue[0];
            this.messageQueue = this.messageQueue.slice(1);
            return [first] as QueuedMessage<T>[];
          }
          return [];
        } else {
          const queued = this.messageQueue.slice();
          this.messageQueue = [];
          return queued as QueuedMessage<T>[];
        }
      },
    };
    if (this._state.systemPrompt !== undefined) {
      cfg.systemPrompt = this._state.systemPrompt;
    }

    const llmMessages = await this.messageTransformer(this._state.messages);
    return { llmMessages, cfg, signal };
  }

  private createExternalCallbackQueue(externalCallback?: ConversationExternalCallback): {
    enqueue: (message: Message) => void;
    flush: () => Promise<void>;
  } {
    let chain = Promise.resolve();
    let hasError = false;
    let firstError: unknown;

    const enqueue = (message: Message): void => {
      if (!externalCallback) {
        return;
      }

      chain = chain
        .then(async () => {
          if (hasError) {
            return;
          }

          await externalCallback(message);
        })
        .catch((error) => {
          if (!hasError) {
            hasError = true;
            firstError = error;
            this.abort();
          }
        });
    };

    const flush = async (): Promise<void> => {
      await chain;
      if (hasError) {
        throw firstError;
      }
    };

    return {
      enqueue,
      flush,
    };
  }

  private async _runAgentLoop(
    userMessage: Message,
    externalCallback?: ConversationExternalCallback
  ): Promise<Message[]> {
    const callbackQueue = this.createExternalCallbackQueue(externalCallback);

    try {
      const { llmMessages, cfg, signal } = await this._prepareRun();
      const updatedMessages = [...llmMessages, userMessage];
      this.emit({
        type: 'message_start',
        messageId: userMessage.id,
        messageType: 'user',
        message: userMessage,
      });
      this.emit({
        type: 'message_end',
        messageId: userMessage.id,
        messageType: 'user',
        message: userMessage,
      });
      this.appendMessage(userMessage);
      this.queuePersistence(userMessage);
      callbackQueue.enqueue(userMessage);

      const callbacks = this._createRunnerCallbacks(callbackQueue.enqueue);
      const result = await runAgentLoop(
        cfg,
        updatedMessages,
        (e) => this.emit(e),
        signal,
        callbacks
      );

      // Check for errors returned by the runner (e.g., budget limits)
      if (result.error) {
        throw new Error(result.error);
      }

      await callbackQueue.flush();
      await this.persistenceChain;
      return result.messages;
    } catch (e) {
      this._state.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this._cleanup();
    }
  }

  private async _runAgentLoopContinue(
    externalCallback?: ConversationExternalCallback
  ): Promise<Message[]> {
    const callbackQueue = this.createExternalCallbackQueue(externalCallback);

    try {
      const { llmMessages, cfg, signal } = await this._prepareRun();

      const lastMessage = llmMessages[llmMessages.length - 1];
      if (!lastMessage) {
        throw new Error('Cannot continue: no messages in context');
      }
      if (lastMessage.role !== 'user' && lastMessage.role !== 'toolResult') {
        throw new Error(
          `Cannot continue from message role: ${lastMessage.role}. Expected 'user' or 'toolResult'.`
        );
      }

      const callbacks = this._createRunnerCallbacks(callbackQueue.enqueue);
      const result = await runAgentLoop(
        cfg,
        [...llmMessages],
        (e) => this.emit(e),
        signal,
        callbacks
      );

      // Check for errors returned by the runner (e.g., budget limits)
      if (result.error) {
        throw new Error(result.error);
      }

      await callbackQueue.flush();
      await this.persistenceChain;
      return result.messages;
    } catch (e) {
      this._state.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this._cleanup();
    }
  }

  private _createRunnerCallbacks(
    onMessageAppended?: (message: Message) => void
  ): AgentRunnerCallbacks {
    return {
      appendMessage: (m) => {
        this.appendMessage(m);
        onMessageAppended?.(m);
        this.queuePersistence(m);
      },
      appendMessages: (ms) => {
        this.appendMessages(ms);
        if (onMessageAppended) {
          for (const message of ms) {
            onMessageAppended(message);
          }
        }
        for (const m of ms) {
          this.queuePersistence(m);
        }
      },
      addPendingToolCall: (id) => this._state.pendingToolCalls.add(id),
      removePendingToolCall: (id) => this._state.pendingToolCalls.delete(id),
    };
  }
}
