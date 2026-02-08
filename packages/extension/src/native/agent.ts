import { randomUUID } from 'node:crypto';

import { MemoryStore } from '@ank1015/llm-memory';
import { Conversation, getModel } from '@ank1015/llm-sdk';
import {
  createFileKeysAdapter,
  createSqliteUsageAdapter,
  createFileSessionsAdapter,
} from '@ank1015/llm-sdk-adapters';

import { createAgentTools } from './tools/index.js';

import type { MessageDispatcher } from './dispatcher.js';
import type { PageHtmlResponse } from '../shared/message.types.js';
import type { Api, AgentEvent, Message } from '@ank1015/llm-types';

const PROJECT_NAME = 'extension';
const SESSION_PATH = '';

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated into a Chrome browser extension.
You have access to tools to:
- Extract and read the current browser page as markdown
- Save notes to personal knowledge memory
- Retrieve saved notes by slug
- Search your memory by semantic query or tags

When the user asks about the current page, use extract_page_markdown to read it first.
Be concise and helpful.`;

// Singleton adapters — created once for the lifetime of the native host process
const keysAdapter = createFileKeysAdapter();
const usageAdapter = createSqliteUsageAdapter();
const sessionsAdapter = createFileSessionsAdapter();
const memoryStore = new MemoryStore();

export interface PromptArgs {
  message: string;
  tabId: number;
  api: Api;
  modelId: string;
  sessionId?: string;
}

export interface PromptResult {
  sessionId: string;
  messages: Message[];
}

export interface LoadSessionResult {
  messages: Message[];
}

function log(msg: string): void {
  process.stderr.write(`[agent] ${msg}\n`);
}

/**
 * Runs an agent prompt using the Conversation class.
 *
 * - Creates or resumes a session
 * - Loads previous messages if resuming
 * - Configures provider, system prompt, and tools
 * - Streams AgentEvents to the extension via dispatcher
 * - Returns the sessionId and new messages
 */
export async function runAgentPrompt(
  args: PromptArgs,
  dispatcher: MessageDispatcher,
  requestId: string
): Promise<PromptResult> {
  // modelId comes as a string from the extension — safe to widen since we check for undefined
  const model = getModel(args.api, args.modelId as Parameters<typeof getModel>[1]);
  if (!model) {
    throw new Error(`Unknown model: ${args.api}/${args.modelId}`);
  }

  // Ensure we have a sessionId — create one if this is a new conversation
  let sessionId = args.sessionId;
  if (!sessionId) {
    const result = await sessionsAdapter.createSession({
      projectName: PROJECT_NAME,
      sessionName: 'Extension Chat',
    });
    sessionId = result.sessionId;
    log(`created session ${sessionId}`);
  }

  // Load previous messages if resuming
  let previousMessages: Message[] = [];
  const messageNodes = await sessionsAdapter.getMessages(
    { projectName: PROJECT_NAME, path: SESSION_PATH, sessionId },
    'main'
  );
  if (messageNodes && messageNodes.length > 0) {
    previousMessages = messageNodes.map((n) => n.message);
    log(`loaded ${previousMessages.length} messages from session ${sessionId}`);
  }

  // Build getPageHtml callback using the dispatcher
  const getPageHtml = async (tabId: number): Promise<string> => {
    const response = await dispatcher.request({
      type: 'getPageHtml',
      requestId: randomUUID(),
      tabId,
    });
    return (response as PageHtmlResponse).html;
  };

  const tools = createAgentTools({
    tabId: args.tabId,
    getPageHtml,
    memoryStore,
  });

  const conversation = new Conversation({
    initialState: {
      messages: previousMessages,
    },
    keysAdapter,
    usageAdapter,
    sessionsAdapter,
    session: {
      projectName: PROJECT_NAME,
      path: SESSION_PATH,
      sessionId,
      sessionName: 'Extension Chat',
    },
  });

  conversation.setProvider({ model });
  conversation.setSystemPrompt(SYSTEM_PROMPT);
  conversation.setTools(tools);

  // Stream events to the extension
  conversation.subscribe((event: AgentEvent) => {
    dispatcher.send({
      type: 'agentEvent',
      requestId,
      event,
    });
  });

  log(`running prompt (model=${args.modelId}, session=${sessionId})`);
  const newMessages = await conversation.prompt(args.message);
  log(`prompt complete, ${newMessages.length} new messages`);

  return { sessionId, messages: newMessages };
}

/**
 * Loads all messages for a given session from disk.
 */
export async function loadSessionMessages(sessionId: string): Promise<LoadSessionResult> {
  log(`loading session ${sessionId}`);
  const messageNodes = await sessionsAdapter.getMessages(
    { projectName: PROJECT_NAME, path: SESSION_PATH, sessionId },
    'main'
  );

  const messages = messageNodes ? messageNodes.map((n) => n.message) : [];
  log(`loaded ${messages.length} messages from session ${sessionId}`);

  return { messages };
}
