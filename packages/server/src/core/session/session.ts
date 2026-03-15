import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { createAllTools, createSystemPrompt } from '@ank1015/llm-agents';
import { complete, Conversation, createSessionManager, getModel } from '@ank1015/llm-sdk';
import { createFileSessionsAdapter, createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import { ArtifactDir } from '../artifact-dir/artifact-dir.js';
import { getConfig } from '../config.js';
import { Project } from '../project/project.js';
import { ensureDir, readMetadata, writeMetadata, pathExists, removeDir } from '../storage/fs.js';
import { createProviderOptions } from '../utils.js';

import type {
  CreateSessionOptions,
  PromptInput,
  ReasoningLevel,
  SessionMetadata,
} from '../types.js';
import type {
  AgentEvent,
  AgentTool,
  Attachment,
  Api,
  BaseAssistantMessage,
  ConversationExternalCallback,
  Message,
  MessageNode,
  Provider,
  Session as StoredSession,
  SessionManager,
  SessionNode,
  SessionSummary,
  UserMessage,
} from '@ank1015/llm-sdk';

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
type SessionExecutionConfig = {
  api: Api;
  modelId: string;
  providerOptions: Record<string, unknown>;
};

type PathContext = {
  branch: string;
  leafNodeId: string;
  messageNodes: MessageNode[];
  tree: StoredSession;
  persistedActiveBranch: string;
};

type PersistenceConfig = {
  execution: SessionExecutionConfig;
  branch: string;
  initialParentId: string;
  activateBranchOnFirstPersist?: boolean;
  onNodePersisted?: (node: MessageNode) => void;
};

type StreamRunOptions = {
  onEvent: (event: AgentEvent) => void;
  onNodePersisted?: (node: MessageNode) => void;
  signal?: AbortSignal;
};

const DEFAULT_ACTIVE_BRANCH = 'main';
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'high';

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
      activeBranch: DEFAULT_ACTIVE_BRANCH,
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
    const metadata = await readMetadata<SessionMetadata>(this.metaDir);
    return {
      ...metadata,
      activeBranch: metadata.activeBranch ?? DEFAULT_ACTIVE_BRANCH,
    };
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
    const execution = this.resolveExecutionConfig(input);
    const [context, agentConfig] = await Promise.all([
      this.loadPathContext(input.leafNodeId),
      this.loadAgentConfig(),
    ]);
    const conversation = this.createConversation({
      execution,
      existingMessages: context.messageNodes.map((node) => node.message),
      agentConfig,
      streamAssistantMessage: false,
    });
    const newMessages = await conversation.prompt(input.message);
    await this.saveMessages(newMessages, {
      execution,
      branch: context.branch,
      initialParentId: context.leafNodeId,
      activateBranchOnFirstPersist: context.branch !== context.persistedActiveBranch,
    });

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
  async streamPrompt(input: PromptInput, options: StreamRunOptions): Promise<Message[]> {
    const execution = this.resolveExecutionConfig(input);
    const [context, agentConfig] = await Promise.all([
      this.loadPathContext(input.leafNodeId),
      this.loadAgentConfig(),
    ]);

    return this.runStreamingPrompt(
      {
        execution,
        existingMessages: context.messageNodes.map((node) => node.message),
        agentConfig,
        promptText: input.message,
        persistence: {
          execution,
          branch: context.branch,
          initialParentId: context.leafNodeId,
          activateBranchOnFirstPersist: context.branch !== context.persistedActiveBranch,
          ...(options.onNodePersisted ? { onNodePersisted: options.onNodePersisted } : {}),
        },
      },
      options
    );
  }

  /** Get the full message history for this session. */
  async getHistory(): Promise<Message[]> {
    const messageNodes = await this.getHistoryNodes();
    return messageNodes.map((node) => node.message);
  }

  /** Get the full message history as MessageNode[] (includes metadata). */
  async getHistoryNodes(): Promise<MessageNode[]> {
    const context = await this.loadPersistedPathContext();
    return context.messageNodes;
  }

  async getMessageTree(): Promise<{
    nodes: MessageNode[];
    persistedLeafNodeId: string | null;
    activeBranch: string;
  }> {
    const [metadata, tree] = await Promise.all([this.getMetadata(), this.getSessionTree()]);
    const persistedActiveBranch = this.resolvePersistedActiveBranch(tree, metadata.activeBranch);
    const persistedContext = this.resolvePersistedPathContext(tree, persistedActiveBranch);

    return {
      nodes: tree.nodes.filter((node): node is MessageNode => node.type === 'message'),
      persistedLeafNodeId: persistedContext.messageNodes.at(-1)?.id ?? null,
      activeBranch: persistedActiveBranch,
    };
  }

  async streamRetryFromUserMessage(
    nodeId: string,
    input: Omit<PromptInput, 'message'>,
    options: StreamRunOptions
  ): Promise<Message[]> {
    return this.streamRewriteFromUserMessage({
      nodeId,
      input,
      options,
      branchPrefix: 'retry',
    });
  }

  async streamEditFromUserMessage(
    nodeId: string,
    input: PromptInput,
    options: StreamRunOptions
  ): Promise<Message[]> {
    return this.streamRewriteFromUserMessage({
      nodeId,
      input,
      options,
      branchPrefix: 'edit',
      messageOverride: input.message,
    });
  }

  private async loadAgentConfig(): Promise<{ systemPrompt: string; tools: AgentTool[] }> {
    const [project, artifactDir] = await Promise.all([
      Project.getById(this.projectId),
      ArtifactDir.getById(this.projectId, this.artifactDirId),
    ]);
    const [projectMetadata, artifactMetadata] = await Promise.all([
      project.getMetadata(),
      artifactDir.getMetadata(),
    ]);

    return {
      systemPrompt: await createSystemPrompt({
        projectName: projectMetadata.name,
        projectDir: project.projectPath,
        artifactName: artifactMetadata.name,
        artifactDir: artifactDir.dirPath,
      }),
      tools: Object.values(createAllTools(artifactDir.dirPath)) as unknown as AgentTool[],
    };
  }

  private resolveExecutionConfig(
    input: Pick<PromptInput, 'api' | 'modelId' | 'reasoningLevel' | 'reasoning'>
  ): SessionExecutionConfig {
    const api = input.api ?? this.api;
    const modelId = input.modelId ?? this.modelId;
    const reasoningLevel = input.reasoningLevel ?? input.reasoning ?? DEFAULT_REASONING_LEVEL;

    return {
      api,
      modelId,
      providerOptions: createProviderOptions(api, reasoningLevel),
    };
  }

  /**
   * Create a persistence callback that saves messages incrementally.
   * Used by streamPrompt() to persist each message as it completes.
   */
  private createPersistenceCallback(config: PersistenceConfig): {
    callback: ConversationExternalCallback;
    nodes: MessageNode[];
  } {
    const nodes: MessageNode[] = [];
    let parentIdPromise = Promise.resolve(config.initialParentId);
    let didActivateBranch = !config.activateBranchOnFirstPersist;

    const callback: ConversationExternalCallback = async (message) => {
      const parentId = await parentIdPromise;
      const result = await this.sessionManager.appendMessage({
        projectName: this.projectName,
        path: '',
        sessionId: this.sessionId,
        parentId,
        branch: config.branch,
        message,
        api: config.execution.api,
        modelId: config.execution.modelId,
        providerOptions: config.execution.providerOptions,
      });
      nodes.push(result.node);
      parentIdPromise = Promise.resolve(result.node.id);
      config.onNodePersisted?.(result.node);

      if (!didActivateBranch) {
        didActivateBranch = true;
        await this.setActiveBranch(config.branch);
      }
    };

    return { callback, nodes };
  }

  /**
   * Save new messages to the session file.
   * Finds the latest node to use as parentId, then appends each message sequentially.
   */
  private async saveMessages(messages: Message[], config: PersistenceConfig): Promise<void> {
    let parentId = config.initialParentId;
    let didActivateBranch = !config.activateBranchOnFirstPersist;

    for (const message of messages) {
      const result = await this.sessionManager.appendMessage({
        projectName: this.projectName,
        path: '',
        sessionId: this.sessionId,
        parentId,
        branch: config.branch,
        message,
        api: config.execution.api,
        modelId: config.execution.modelId,
        providerOptions: config.execution.providerOptions,
      });
      parentId = result.node.id;

      if (!didActivateBranch) {
        didActivateBranch = true;
        await this.setActiveBranch(config.branch);
      }
    }
  }

  private async streamRewriteFromUserMessage(input: {
    nodeId: string;
    input: Omit<PromptInput, 'message'>;
    options: StreamRunOptions;
    branchPrefix: 'retry' | 'edit';
    messageOverride?: string;
  }): Promise<Message[]> {
    const execution = this.resolveExecutionConfig(input.input);
    const [context, agentConfig] = await Promise.all([
      this.loadPathContext(input.input.leafNodeId),
      this.loadAgentConfig(),
    ]);

    const targetNode = context.messageNodes.find((node) => node.id === input.nodeId);
    if (!targetNode) {
      throw new Error(`User message "${input.nodeId}" was not found on the selected path`);
    }
    if (targetNode.message.role !== 'user') {
      throw new Error('Only user messages can be edited or retried');
    }
    if (!targetNode.parentId) {
      throw new Error('Cannot rewrite the root session node');
    }

    const payload = this.extractUserPromptPayload(
      targetNode.message as UserMessage,
      input.messageOverride
    );
    const parentPathNodes = this.getMessagePathNodesToNode(context.tree, targetNode.parentId);
    const branch = this.createBranchName(input.branchPrefix);

    return this.runStreamingPrompt(
      {
        execution,
        existingMessages: parentPathNodes.map((node) => node.message),
        agentConfig,
        promptText: payload.text,
        attachments: payload.attachments,
        persistence: {
          execution,
          branch,
          initialParentId: targetNode.parentId,
          activateBranchOnFirstPersist: true,
          ...(input.options.onNodePersisted
            ? { onNodePersisted: input.options.onNodePersisted }
            : {}),
        },
      },
      input.options
    );
  }

  private runStreamingPrompt(
    input: {
      execution: SessionExecutionConfig;
      existingMessages: Message[];
      agentConfig: { systemPrompt: string; tools: AgentTool[] };
      promptText: string;
      attachments?: Attachment[];
      persistence: PersistenceConfig;
    },
    options: StreamRunOptions
  ): Promise<Message[]> {
    const conversation = this.createConversation({
      execution: input.execution,
      existingMessages: input.existingMessages,
      agentConfig: input.agentConfig,
      streamAssistantMessage: true,
    });

    const unsubscribe = conversation.subscribe((event) => options.onEvent(event));
    const abortListener = (): void => {
      conversation.abort();
    };
    if (options.signal) {
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    return conversation
      .prompt(
        input.promptText,
        input.attachments,
        this.createPersistenceCallback(input.persistence).callback
      )
      .finally(() => {
        unsubscribe();
        if (options.signal) {
          options.signal.removeEventListener('abort', abortListener);
        }
      });
  }

  private createConversation(input: {
    execution: SessionExecutionConfig;
    existingMessages: Message[];
    agentConfig: { systemPrompt: string; tools: AgentTool[] };
    streamAssistantMessage: boolean;
  }): Conversation {
    const model = this.resolveModel(input.execution);
    const keysAdapter = createFileKeysAdapter();
    const conversation = new Conversation({
      keysAdapter,
      streamAssistantMessage: input.streamAssistantMessage,
      initialState: {
        messages: input.existingMessages,
        tools: input.agentConfig.tools,
      },
    });

    conversation.setProvider({
      model,
      providerOptions: input.execution.providerOptions,
    } as Provider<Api>);
    conversation.setSystemPrompt(input.agentConfig.systemPrompt);
    conversation.setTools(input.agentConfig.tools);

    return conversation;
  }

  private resolveModel(
    execution: SessionExecutionConfig
  ): NonNullable<ReturnType<typeof getModel>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = getModel(execution.api, execution.modelId as any);
    if (!model) {
      throw new Error(`Model "${execution.modelId}" not found for API "${execution.api}"`);
    }
    return model;
  }

  private async loadPersistedPathContext(): Promise<PathContext> {
    return this.loadPathContext();
  }

  private async loadPathContext(leafNodeId?: string): Promise<PathContext> {
    const [metadata, tree] = await Promise.all([this.getMetadata(), this.getSessionTree()]);
    const persistedActiveBranch = this.resolvePersistedActiveBranch(tree, metadata.activeBranch);

    if (leafNodeId) {
      return this.resolvePathContextFromLeaf(tree, persistedActiveBranch, leafNodeId);
    }

    return this.resolvePersistedPathContext(tree, persistedActiveBranch);
  }

  private async getSessionTree(): Promise<StoredSession> {
    const session = await this.sessionManager.getSession(this.projectName, this.sessionId);
    if (!session) {
      throw new Error(`Session "${this.sessionId}" not found`);
    }
    return session;
  }

  private resolvePersistedActiveBranch(tree: StoredSession, activeBranch: string): string {
    return tree.nodes.some((node) => node.branch === activeBranch)
      ? activeBranch
      : DEFAULT_ACTIVE_BRANCH;
  }

  private resolvePersistedPathContext(
    tree: StoredSession,
    persistedActiveBranch: string
  ): PathContext {
    const branchNodes = tree.nodes.filter((node) => node.branch === persistedActiveBranch);
    const leafNode = branchNodes[branchNodes.length - 1];

    if (!leafNode) {
      throw new Error(`Session "${this.sessionId}" has no nodes — cannot resolve active path`);
    }

    return {
      branch: persistedActiveBranch,
      leafNodeId: leafNode.id,
      messageNodes: this.getMessagePathNodesToNode(tree, leafNode.id),
      tree,
      persistedActiveBranch,
    };
  }

  private resolvePathContextFromLeaf(
    tree: StoredSession,
    persistedActiveBranch: string,
    leafNodeId: string
  ): PathContext {
    const node = tree.nodes.find((candidate) => candidate.id === leafNodeId);
    if (!node) {
      throw new Error(`Leaf node "${leafNodeId}" was not found in session "${this.sessionId}"`);
    }
    if (node.type !== 'message') {
      throw new Error('leafNodeId must reference a message node');
    }
    if (!this.isLeafNode(tree, node.id)) {
      throw new Error(`Leaf node "${leafNodeId}" is not a visible leaf node`);
    }

    return {
      branch: node.branch,
      leafNodeId: node.id,
      messageNodes: this.getMessagePathNodesToNode(tree, node.id),
      tree,
      persistedActiveBranch,
    };
  }

  private getMessagePathNodesToNode(tree: StoredSession, nodeId: string): MessageNode[] {
    return this.getLineageToNode(tree, nodeId).filter(
      (node): node is MessageNode => node.type === 'message'
    );
  }

  private isLeafNode(tree: StoredSession, nodeId: string): boolean {
    return !tree.nodes.some((node) => node.parentId === nodeId);
  }

  private getLineageToNode(tree: StoredSession, nodeId: string): SessionNode[] {
    const nodeMap = new Map<string, SessionNode>(tree.nodes.map((node) => [node.id, node]));
    const lineage: SessionNode[] = [];
    let current = nodeMap.get(nodeId);

    if (!current) {
      throw new Error(`Node "${nodeId}" was not found in session "${this.sessionId}"`);
    }

    while (current) {
      lineage.push(current);
      if (current.parentId === null) {
        break;
      }

      const parent = nodeMap.get(current.parentId);
      if (!parent) {
        throw new Error(`Node "${current.id}" has a missing parent in session "${this.sessionId}"`);
      }
      current = parent;
    }

    return lineage.reverse();
  }

  private extractUserPromptPayload(
    message: UserMessage,
    messageOverride?: string
  ): { text: string; attachments: Attachment[] } {
    const textBlocks: string[] = [];
    const attachments: Attachment[] = [];

    for (const [index, block] of message.content.entries()) {
      if (block.type === 'text') {
        textBlocks.push(block.content);
        continue;
      }

      if (block.type === 'image') {
        const size = typeof block.metadata?.size === 'number' ? block.metadata.size : undefined;
        attachments.push({
          id: `${message.id}:image:${index}`,
          type: 'image',
          fileName: String(block.metadata?.fileName ?? `image-${index}`),
          mimeType: block.mimeType,
          content: block.data,
          ...(size !== undefined ? { size } : {}),
        });
        continue;
      }

      const size = typeof block.metadata?.size === 'number' ? block.metadata.size : undefined;
      attachments.push({
        id: `${message.id}:file:${index}`,
        type: 'file',
        fileName: block.filename,
        mimeType: block.mimeType,
        content: block.data,
        ...(size !== undefined ? { size } : {}),
      });
    }

    return {
      text: messageOverride ?? textBlocks.join('\n'),
      attachments,
    };
  }

  private createBranchName(prefix: 'retry' | 'edit'): string {
    return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  }

  private async setActiveBranch(branch: string): Promise<void> {
    const metadata = await this.getMetadata();
    await writeMetadata(this.metaDir, {
      ...metadata,
      activeBranch: branch,
    });
  }
}
