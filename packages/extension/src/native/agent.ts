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
import type { PageHtmlResponse, HighlightTextResponse } from '../shared/message.types.js';
import type { Api, AgentEvent, Message } from '@ank1015/llm-types';

const PROJECT_NAME = 'extension';
const SESSION_PATH = '';

const SYSTEM_PROMPT = `You are a learning assistant in a Chrome browser extension. Your purpose is to help the user learn, understand, and retain knowledge from articles, blog posts, research papers, and web content.

## Your Tools
- \`extract_page_markdown\` — Read the current page as markdown
- \`highlight_text\` — Highlight and scroll to specific text on the page
- \`search_memory\` — Search past notes by semantic query or tags
- \`get_notes\` — Retrieve full notes by slug
- \`save_note\` — Save a structured markdown note

## Workflow

### Phase 1: Initial Overview
When the user starts a session (first message is usually requesting a summary):
1. Use \`extract_page_markdown\` to read the page.
2. Use \`search_memory\` with semantic queries and relevant tags to find related past notes.
3. If relevant notes are found, use \`get_notes\` to read them for prior context.
4. Provide a structured summary organized by the page's sections/headings. For each section, give a 2-3 sentence overview of what it covers and why it matters. If past notes are relevant, briefly note the connection. This helps the user decide which sections to dive into.

### Phase 2: Deep Dive & Discussion
When the user asks to explore a section or asks follow-up questions:
- Give thorough explanations with examples from the page.
- Use \`highlight_text\` to highlight the relevant passage being discussed so the user can see it on the page.
- Connect to prior knowledge from memory notes only when it genuinely helps — don't force it.
- Answer cross-questions, clarify concepts, draw connections between ideas.

### Phase 3: Saving Notes
When the user asks to save notes:
- Use \`save_note\` with markdown content structured under \`##\` headings (this aids future search).
- Focus on: key claims from the source, important insights, and deductions from your discussion.
- Keep it concise — capture the essence, not a copy of the article.
- Use descriptive lowercase tags (e.g., "machine-learning", "distributed-systems", "react-patterns").
- Set the \`source\` field to the page URL when available.

## Guidelines
- Always highlight relevant text on the page when explaining specific parts.
- Reference past notes naturally (e.g., "This relates to your notes on X...") — only when it adds value.
- When asked to save, capture key takeaways and deductions from the session, not just the article content.`;

// Singleton adapters — created once for the lifetime of the native host process
const keysAdapter = createFileKeysAdapter();
const usageAdapter = createSqliteUsageAdapter();
const sessionsAdapter = createFileSessionsAdapter();
const memoryStore = new MemoryStore();

export interface PromptArgs {
  message: string;
  tabId: number;
  tabUrl: string;
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

  // Build highlightText callback using the dispatcher
  const highlightText = async (tabId: number, text: string): Promise<string> => {
    const response = await dispatcher.request({
      type: 'highlightText',
      requestId: randomUUID(),
      tabId,
      text,
    });
    return (response as HighlightTextResponse).highlightedText;
  };

  const tools = createAgentTools({
    tabId: args.tabId,
    tabUrl: args.tabUrl,
    getPageHtml,
    highlightText,
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
