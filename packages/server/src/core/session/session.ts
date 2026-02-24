import { join } from 'node:path';

import {
  Conversation,
  createSessionManager,
  getModel,
  type Api,
  type Message,
  type MessageNode,
  type Provider,
  type SessionManager,
  type SessionSummary,
} from '@ank1015/llm-sdk';
import { createFileSessionsAdapter, createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import { getConfig } from '../config.js';
import { ensureDir, readMetadata, writeMetadata, pathExists } from '../storage/fs.js';

import type { CreateSessionOptions, PromptInput, SessionMetadata } from '../types.js';

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

  /** Read this session's metadata */
  async getMetadata(): Promise<SessionMetadata> {
    return readMetadata<SessionMetadata>(this.metaDir);
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

    const provider: Provider<typeof this.api> = { model };
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

    // Create conversation and configure
    const conversation = new Conversation({
      keysAdapter,
      streamAssistantMessage: false,
    });
    conversation.setProvider(provider);

    if (existingMessages.length > 0) {
      conversation.replaceMessages(existingMessages);
    }

    // Run the prompt
    const newMessages = await conversation.prompt(input.message);

    // Save new messages to session
    await this.saveMessages(newMessages);

    return newMessages;
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
