import { join } from 'node:path';

import {
  complete,
  Conversation,
  createSessionManager,
  getModel,
  GoogleThinkingLevel,
} from '@ank1015/llm-sdk';
import { createFileSessionsAdapter, createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import { getConfig } from '../config.js';
import { ensureDir, readMetadata, writeMetadata, pathExists, removeDir } from '../storage/fs.js';
import { createAllTools } from '../tools/index.js';

import type { CreateSessionOptions, PromptInput, SessionMetadata } from '../types.js';
import type {
  AgentEvent,
  AgentTool,
  Api,
  BaseAssistantMessage,
  ConversationExternalCallback,
  Message,
  MessageNode,
  Provider,
  SessionManager,
  SessionSummary,

  GoogleProviderOptions} from '@ank1015/llm-sdk';

/**
 * Manages sessions within an artifact directory.
 *
 * Each session has two storage locations:
 * - JSONL file (via SDK SessionManager): conversation messages
 *     ~/.llm/projects/{projectId}/artifacts/{artifactDirId}/sessions/{projectId}/{sessionId}.jsonl
 * - metadata.json: session config (api, modelId, name)
 *     ~/.llm/projects/{projectId}/artifacts/{artifactDirId}/sessions/meta/{sessionId}/metadata.json
 *
 * Uses the SDK's SessionManager + FileSessionsAdapter for persistence
 * and Conversation class for runtime LLM interaction.
 */
export class Session {
  private sessionManager: SessionManager;
  /** projectName used in SessionManager (maps to our projectId) */
  private readonly projectName: string;
  /** Path where session metadata.json files live */
  private readonly metaDir: string;

  constructor(
    readonly projectId: string,
    readonly artifactDirId: string,
    readonly sessionId: string,
    readonly api: Api,
    readonly modelId: string
  ) {
    const { dataRoot } = getConfig();
    const baseDir = join(dataRoot, projectId, 'artifacts', artifactDirId, 'sessions');

    this.projectName = projectId;
    this.metaDir = join(baseDir, 'meta', sessionId);

    const sessionsAdapter = createFileSessionsAdapter(baseDir);
    this.sessionManager = createSessionManager(sessionsAdapter);
  }

  /**
   * Create a new session in an artifact directory.
   */
  static async create(
    projectId: string,
    artifactDirId: string,
    options: CreateSessionOptions
  ): Promise<Session> {
    const { dataRoot } = getConfig();
    const baseDir = join(dataRoot, projectId, 'artifacts', artifactDirId, 'sessions');
    const sessionsAdapter = createFileSessionsAdapter(baseDir);
    const sessionManager = createSessionManager(sessionsAdapter);

    const api = options.api as Api;
    const createInput = {
      projectName: projectId,
      ...(options.name !== null ? { sessionName: options.name } : {}),
    };
    const { sessionId } = await sessionManager.createSession(createInput);

    // Write session metadata
    const metaDir = join(baseDir, 'meta', sessionId);
    await ensureDir(metaDir);

    const metadata: SessionMetadata = {
      id: sessionId,
      name: options.name ?? 'Untitled Session',
      api: options.api,
      modelId: options.modelId,
      createdAt: new Date().toISOString(),
    };
    await writeMetadata(metaDir, metadata);

    return new Session(projectId, artifactDirId, sessionId, api, options.modelId);
  }

  /**
   * Load an existing session by ID.
   * Reads metadata to reconstruct the Session with correct api/modelId.
   */
  static async getById(
    projectId: string,
    artifactDirId: string,
    sessionId: string
  ): Promise<Session> {
    const { dataRoot } = getConfig();
    const baseDir = join(dataRoot, projectId, 'artifacts', artifactDirId, 'sessions');
    const metaDir = join(baseDir, 'meta', sessionId);

    if (!(await pathExists(metaDir))) {
      throw new Error(`Session "${sessionId}" not found in artifact dir "${artifactDirId}"`);
    }

    const metadata = await readMetadata<SessionMetadata>(metaDir);
    return new Session(projectId, artifactDirId, sessionId, metadata.api as Api, metadata.modelId);
  }

  /**
   * List all sessions in an artifact directory.
   */
  static async list(projectId: string, artifactDirId: string): Promise<SessionSummary[]> {
    const { dataRoot } = getConfig();
    const baseDir = join(dataRoot, projectId, 'artifacts', artifactDirId, 'sessions');
    const sessionsAdapter = createFileSessionsAdapter(baseDir);
    const sessionManager = createSessionManager(sessionsAdapter);

    return sessionManager.listSessions(projectId);
  }

  /**
   * Delete a session by removing its SDK data and metadata directory.
   */
  static async delete(projectId: string, artifactDirId: string, sessionId: string): Promise<void> {
    const { dataRoot } = getConfig();
    const baseDir = join(dataRoot, projectId, 'artifacts', artifactDirId, 'sessions');
    const sessionsAdapter = createFileSessionsAdapter(baseDir);
    const sessionManager = createSessionManager(sessionsAdapter);

    await sessionManager.deleteSession(projectId, sessionId);

    const metaDir = join(baseDir, 'meta', sessionId);
    if (await pathExists(metaDir)) {
      await removeDir(metaDir);
    }
  }

  /** Read this session's metadata */
  async getMetadata(): Promise<SessionMetadata> {
    return readMetadata<SessionMetadata>(this.metaDir);
  }

  /**
   * Update the session name.
   * Updates both the SDK session (JSONL header) and our metadata.json.
   */
  async updateName(name: string): Promise<void> {
    // Update SDK session name
    await this.sessionManager.updateSessionName(this.projectName, this.sessionId, name);

    // Update our metadata.json
    const metadata = await this.getMetadata();
    metadata.name = name;
    await writeMetadata(this.metaDir, metadata);
  }

  /**
   * Generate a descriptive session name from the user's first message using an LLM.
   * Uses a cheap/fast model (Gemini Flash) to generate a 2-6 word topic name.
   * Falls back to a truncated version of the query if the LLM call fails.
   */
  async generateName(query: string): Promise<string> {
    const namingModel = getModel(
      'google',
      'gemini-3-flash-preview' as Parameters<typeof getModel<'google'>>[1]
    );
    if (!namingModel) {
      // Fallback: use first 50 chars of query
      const fallback = query.slice(0, 50).trim() || 'New chat';
      await this.updateName(fallback);
      return fallback;
    }

    const keysAdapter = createFileKeysAdapter();

    try {
      const response: BaseAssistantMessage<Api> = await complete(
        namingModel,
        {
          messages: [
            {
              role: 'user' as const,
              id: 'name-req',
              content: [{ type: 'text' as const, content: query }],
            },
          ],
          systemPrompt:
            "You are a conversation naming assistant. Given the user's first message, generate a short, descriptive topic name (2-6 words) for the conversation. Reply with ONLY the topic name, nothing else. No quotes, no punctuation at the end, no explanation.",
        },
        { keysAdapter }
      );

      // Extract text from the response content blocks
      let generatedName = 'New chat';
      for (const block of response.content) {
        if (block.type === 'response') {
          const responseBlock = block as {
            type: string;
            content: Array<{ type: string; content: string }>;
          };
          for (const part of responseBlock.content) {
            if (part.type === 'text' && part.content.trim()) {
              generatedName = part.content.trim();
              break;
            }
          }
          break;
        }
      }

      await this.updateName(generatedName);
      return generatedName;
    } catch {
      // Fallback: use first 50 chars of query
      const fallback = query.slice(0, 50).trim() || 'New chat';
      await this.updateName(fallback);
      return fallback;
    }
  }

  /**
   * Send a message and get the LLM's response.
   *
   * Flow:
   * 1. Load message history from session file
   * 2. Create a Conversation instance, populate with history
   * 3. Call conversation.prompt() — runs full agent loop
   * 4. Save all new messages back to session file
   * 5. Return the new messages
   */
  async prompt(input: PromptInput): Promise<Message[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = getModel(this.api, this.modelId as any);
    if (!model) {
      throw new Error(`Model "${this.modelId}" not found for API "${this.api}"`);
    }

    // const provider: Provider<typeof this.api> = { model };
    const keysAdapter = createFileKeysAdapter();

    // Load existing messages
    const messageNodes = await this.sessionManager.getMessages(
      this.projectName,
      this.sessionId,
      'main'
    );
    const existingMessages: Message[] = (messageNodes ?? []).map(
      (node: MessageNode) => node.message
    );

    // Create tools scoped to the artifact directory's working path
    const { projectsRoot } = getConfig();
    const artifactDirPath = join(projectsRoot, this.projectId, this.artifactDirId);
    const tools = createAllTools(artifactDirPath);

    // Create conversation and configure
    const conversation = new Conversation({
      keysAdapter,
      streamAssistantMessage: false,
    });
    // conversation.setProvider({model} as Provider<Api>);
    conversation.setProvider({
      model: getModel('google', 'gemini-3-pro-preview'),
      providerOptions: {
        thinkingConfig: {
          thinkingLevel: GoogleThinkingLevel.HIGH,
          includeThoughts: true,
        },
      } as GoogleProviderOptions,
    } as Provider<Api>);
    conversation.setTools(Object.values(tools));

    if (existingMessages.length > 0) {
      conversation.replaceMessages(existingMessages);
    }

    // Run the prompt
    const newMessages = await conversation.prompt(input.message);

    // Save new messages to session
    await this.saveMessages(newMessages);

    return newMessages;
  }

  /**
   * Send a message and stream the LLM's response via SSE events.
   *
   * Unlike `prompt()`, this method:
   * - Streams events to the caller via `onEvent` callback
   * - Saves messages incrementally via persistence callback
   * - Supports cancellation via AbortSignal
   */
  async streamPrompt(
    input: PromptInput,
    options: {
      onEvent: (event: AgentEvent) => void;
      signal?: AbortSignal;
    }
  ): Promise<Message[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = getModel(this.api, this.modelId as any);
    if (!model) {
      throw new Error(`Model "${this.modelId}" not found for API "${this.api}"`);
    }

    const keysAdapter = createFileKeysAdapter();

    // Load existing messages
    const messageNodes = await this.sessionManager.getMessages(
      this.projectName,
      this.sessionId,
      'main'
    );
    const existingMessages: Message[] = (messageNodes ?? []).map(
      (node: MessageNode) => node.message
    );

    // Create tools scoped to the artifact directory's working path
    const { projectsRoot } = getConfig();
    const artifactDirPath = join(projectsRoot, this.projectId, this.artifactDirId);
    const tools = createAllTools(artifactDirPath);

    // Create conversation with streaming enabled
    const conversation = new Conversation({
      keysAdapter,
      streamAssistantMessage: true,
      initialState: {
        messages: existingMessages,
        tools: Object.values(tools) as unknown as AgentTool[],
      },
    });

    // conversation.setProvider({ model } as Provider<Api>);
    conversation.setProvider({
      model: getModel('google', 'gemini-3-pro-preview'),
      providerOptions: {
        thinkingConfig: {
          thinkingLevel: GoogleThinkingLevel.HIGH,
          includeThoughts: true,
        },
      } as GoogleProviderOptions,
    } as Provider<Api>);

    // Subscribe to conversation events
    const unsubscribe = conversation.subscribe((event) => options.onEvent(event));

    // Wire abort signal
    const abortListener = (): void => {
      conversation.abort();
    };
    if (options.signal) {
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    try {
      // Create persistence callback to save messages incrementally
      const persistence = this.createPersistenceCallback();
      const newMessages = await conversation.prompt(input.message, undefined, persistence.callback);
      return newMessages;
    } finally {
      unsubscribe();
      if (options.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
    }
  }

  /** Get the full message history for this session. */
  async getHistory(): Promise<Message[]> {
    const messageNodes = await this.sessionManager.getMessages(
      this.projectName,
      this.sessionId,
      'main'
    );
    return (messageNodes ?? []).map((node: MessageNode) => node.message);
  }

  /** Get the full message history as MessageNode[] (includes metadata). */
  async getHistoryNodes(): Promise<MessageNode[]> {
    const messageNodes = await this.sessionManager.getMessages(
      this.projectName,
      this.sessionId,
      'main'
    );
    return messageNodes ?? [];
  }

  /**
   * Create a persistence callback that saves messages incrementally.
   * Used by streamPrompt() to persist each message as it completes.
   */
  private createPersistenceCallback(): {
    callback: ConversationExternalCallback;
    nodes: MessageNode[];
  } {
    const nodes: MessageNode[] = [];
    let parentIdPromise: Promise<string> = this.sessionManager
      .getLatestNode(this.projectName, this.sessionId, 'main')
      .then((node) => {
        if (!node) {
          throw new Error(`Session "${this.sessionId}" has no nodes — cannot append messages`);
        }
        return node.id;
      });

    const callback: ConversationExternalCallback = async (message) => {
      const parentId = await parentIdPromise;
      const result = await this.sessionManager.appendMessage({
        projectName: this.projectName,
        path: '',
        sessionId: this.sessionId,
        parentId,
        branch: 'main',
        message,
        api: this.api,
        modelId: this.modelId,
      });
      nodes.push(result.node);
      parentIdPromise = Promise.resolve(result.node.id);
    };

    return { callback, nodes };
  }

  /**
   * Save new messages to the session file.
   * Finds the latest node to use as parentId, then appends each message sequentially.
   */
  private async saveMessages(messages: Message[]): Promise<void> {
    let latestNode = await this.sessionManager.getLatestNode(
      this.projectName,
      this.sessionId,
      'main'
    );

    if (!latestNode) {
      throw new Error(`Session "${this.sessionId}" has no nodes — cannot append messages`);
    }

    for (const message of messages) {
      const result = await this.sessionManager.appendMessage({
        projectName: this.projectName,
        path: '',
        sessionId: this.sessionId,
        parentId: latestNode.id,
        branch: 'main',
        message,
        api: this.api,
        modelId: this.modelId,
      });

      latestNode = result.node;
    }
  }
}
