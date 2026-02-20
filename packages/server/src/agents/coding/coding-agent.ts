/**
 * CodingAgent — stateful coding assistant backed by session persistence.
 *
 * Wraps Conversation from the SDK with coding tools and FileSessionsAdapter
 * so each prompt round-trip is automatically persisted to a JSONL session file.
 */

import {
  Conversation,
  createSessionManager,
  type ConversationExternalCallback,
  type AgentEvent,
  type Api,
  type Message,
  type Provider,
  type KeysAdapter,
} from '@ank1015/llm-sdk';
import { FileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

import { createCodingTools, type ToolsOptions } from './tools/index.js';

/** Options for constructing a CodingAgent. */
export interface CodingAgentOptions {
  /** LLM provider (model + API config) */
  provider: Provider<Api>;
  /** Working directory for tool execution */
  cwd: string;
  /** Project name used for session storage grouping */
  projectName: string;
  /** Optional sub-path within the project for session files */
  path?: string;
  /** System prompt for the coding agent */
  systemPrompt?: string;
  /** Optional keys adapter for credential resolution */
  keysAdapter?: KeysAdapter;
  /** Optional cost limit */
  costLimit?: number;
  /** Optional tool configuration */
  toolsOptions?: ToolsOptions;
  /** Base directory for session files (default: ~/.llm/sessions) */
  sessionsBaseDir?: string;
}

/** Input for a prompt call. */
export interface PromptInput {
  /** User message text */
  message: string;
  /** Session ID — omit to create a new session */
  sessionId?: string;
  /** Branch to operate on (default: "main") */
  branch?: string;
}

/** Result of a prompt call. */
export interface PromptResult {
  /** The session ID (created or existing) */
  sessionId: string;
  /** All new messages produced during this prompt (user + assistant + tool results) */
  messages: Message[];
  /** Events emitted during the prompt */
  events: AgentEvent[];
}

export class CodingAgent {
  private provider: Provider<Api>;
  private cwd: string;
  private projectName: string;
  private path: string;
  private systemPrompt?: string;
  private keysAdapter?: KeysAdapter;
  private costLimit?: number;
  private toolsOptions?: ToolsOptions;
  private sessionManager: ReturnType<typeof createSessionManager>;

  constructor(options: CodingAgentOptions) {
    this.provider = options.provider;
    this.cwd = options.cwd;
    this.projectName = options.projectName;
    this.path = options.path ?? '';
    if (options.systemPrompt !== undefined) this.systemPrompt = options.systemPrompt;
    if (options.keysAdapter !== undefined) this.keysAdapter = options.keysAdapter;
    if (options.costLimit !== undefined) this.costLimit = options.costLimit;
    if (options.toolsOptions !== undefined) this.toolsOptions = options.toolsOptions;

    const adapter = new FileSessionsAdapter(options.sessionsBaseDir);
    this.sessionManager = createSessionManager(adapter);
  }

  /**
   * Send a prompt to the coding agent.
   *
   * - Loads (or creates) a session
   * - Fetches existing messages for the branch
   * - Runs the LLM agent loop with coding tools
   * - Persists every new message back to the session
   */
  async prompt(input: PromptInput): Promise<PromptResult> {
    const branch = input.branch ?? 'main';

    // 1. Resolve or create the session
    let sessionId: string;
    let parentId: string;
    let existingMessages: Message[] = [];

    if (input.sessionId) {
      sessionId = input.sessionId;

      // Load existing messages for the branch
      const messageNodes = await this.sessionManager.getMessages(
        this.projectName,
        sessionId,
        branch,
        this.path
      );

      if (!messageNodes) {
        throw new Error(`Session ${sessionId} not found`);
      }

      existingMessages = messageNodes.map((n) => n.message);

      // Find the latest node on this branch to use as parent
      const latestNode = await this.sessionManager.getLatestNode(
        this.projectName,
        sessionId,
        branch,
        this.path
      );
      parentId = latestNode?.id ?? sessionId;
    } else {
      // Create a new session
      const { sessionId: newId, header } = await this.sessionManager.createSession({
        projectName: this.projectName,
        path: this.path,
      });
      sessionId = newId;
      parentId = header.id;
    }

    // 2. Create conversation with existing messages
    const tools = createCodingTools(this.cwd, this.toolsOptions);

    const conversationOpts: ConstructorParameters<typeof Conversation>[0] = {
      initialState: {
        messages: existingMessages,
        tools,
        provider: this.provider,
      },
    };
    if (this.keysAdapter !== undefined) conversationOpts.keysAdapter = this.keysAdapter;
    if (this.costLimit !== undefined) conversationOpts.costLimit = this.costLimit;

    const conversation = new Conversation(conversationOpts);

    if (this.systemPrompt) {
      conversation.setSystemPrompt(this.systemPrompt);
    }

    // 3. Collect events
    const events: AgentEvent[] = [];
    conversation.subscribe((e) => events.push(e));

    // 4. Build external callback that persists each message to the session
    let currentParentId = parentId;
    const externalCallback: ConversationExternalCallback = async (message) => {
      const { node } = await this.sessionManager.appendMessage({
        projectName: this.projectName,
        path: this.path,
        sessionId,
        parentId: currentParentId,
        branch,
        message,
        api: this.provider.model.api,
        modelId: this.provider.model.id,
        providerOptions: (this.provider.providerOptions as Record<string, unknown>) ?? {},
      });
      // Chain: next message's parent is this node
      currentParentId = node.id;
    };

    // 5. Run the prompt
    const newMessages = await conversation.prompt(input.message, undefined, externalCallback);

    return {
      sessionId,
      messages: newMessages,
      events,
    };
  }
}
