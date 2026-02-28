/* eslint-disable no-fallthrough */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { connect, type ChromeClient } from '@ank1015/llm-extension';
import {
  Conversation,
  createSessionManager,
  getModel,
  getModels,
  isValidApi,
  KnownApis,
} from '@ank1015/llm-sdk';
import { createFileKeysAdapter, createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

import {
  createActTool,
  createDownloadTool,
  createExtractTool,
  createInspectTool,
  createNavigationTool,
  createScreenshotTool,
} from './tools/browser/index.js';
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
} from './tools/file-system/index.js';

import type { CodexProviderOptions } from '../../types/dist/providers/codex.js';
import type {
  AgentEvent,
  AgentTool,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  ConversationExternalCallback,
  Message,
  SessionManager,
} from '@ank1015/llm-sdk';

const TEST_TOOLS_CWD = '/Users/notacoder/Desktop/test';
const AGENTS_PACKAGE_DIR = '/Users/notacoder/Desktop/agents/llm/packages/agents';
const AGENT_SCRIPT_WORKSPACE_DIR = `${AGENTS_PACKAGE_DIR}/scripts/workspace`;
const AGENT_SCRIPT_RUNNER_PATH = `${AGENTS_PACKAGE_DIR}/scripts/run.sh`;
const AGENT_SESSIONS_DIR = `${AGENTS_PACKAGE_DIR}/sessions`;
const DEFAULT_PROJECT_NAME = 'agents-test-cli';
const DEFAULT_SESSION_NAME = 'Agents Test CLI Session';
const DEFAULT_API: Api = 'openai';
const DEFAULT_MODEL_BY_API: Record<Api, string> = {
  openai: 'gpt-5-mini',
  codex: 'gpt-5.3-codex',
  google: 'gemini-3-flash-preview',
  deepseek: 'deepseek-reasoner',
  anthropic: 'claude-sonnet-4-5',
  'claude-code': 'claude-sonnet-4-5',
  zai: 'glm-4.7',
  kimi: 'kimi-k2.5',
  minimax: 'MiniMax-M2.5',
  cerebras: 'gpt-oss-120b',
  openrouter: 'ai21/jamba-large-1.7',
};

function formatToday(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatIsoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatFileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function buildSystemPrompt(
  toolsCwd: string,
  scriptWorkspaceDir: string,
  scriptRunnerPath: string,
  today: string
): string {
  return `
You are a practical assistant focused on completing browser-related tasks with reliable execution.
You also have file-system access for creating notes, scripts, outputs, and intermediate artifacts.

Identity and Scope:
- You help users perform tasks in a real browser and local files.
- Prefer direct tool usage over speculation.
- Be concise, accurate, and action-oriented.

Filesystem Tools:
- read: Read file contents.
- write: Create or overwrite files.
- edit: Surgical edits by replacing exact old text with new text.
- bash: Run shell commands for validation, discovery, and automation.

Filesystem Guidelines:
- Read files before editing them.
- Use edit for targeted changes; use write for new files or full rewrites.
- Use bash for verification (tests, listing files, quick checks), not for replacing clear text responses.
- Keep outputs organized and predictable.
- When gathering web info, save useful notes/artifacts under the working directory.

Browser Tools:
- navigation: open/switch/list/reload/back/forward/close tabs in a scoped window.
  Example:
  {"action":"open_url","url":"https://example.com"}
  {"action":"list_tabs"}
- inspect_page: compact page snapshot (interactive elements, key text, forms, alerts).
  Example:
  {"tabId":123,"maxInteractive":120,"maxTextBlocks":40}
- act: perform actions on elements (click, type, clear, pressEnter, select, scroll, hover, focus).
  Example:
  {"type":"click","target":{"id":"submit"}}
  {"type":"type","target":"E1","value":"hello@example.com"}
  {"type":"select","target":{"id":"country"},"value":"United States"}
  {"type":"scroll","value":{"to":"bottom"}}
- screenshot: capture current visible tab image (png/jpeg).
  Example:
  {"tabId":123,"format":"png"}
- download: download URL into browser Downloads (optional directory/filename).
  Example:
  {"url":"https://example.com/report.pdf","directory":"research","filename":"report.pdf"}
- extract: focused extraction without huge snapshots.
  Modes:
  1) links (optional filter/limit)
     {"what":{"type":"links","filter":"pricing","limit":50}}
  2) main_text
     {"what":{"type":"main_text","maxChars":12000}}
  3) selected_text
     {"what":{"type":"selected_text"}}
  4) container_html (rare)
     {"what":{"type":"container_html","selector":"main article","maxChars":20000}}

Browser Guidelines:
- Start with navigation + inspect_page to understand page state.
- Use act with inspect element ids (E1, E2, etc.) when possible for reliable targeting.
- Use extract when you need content (links/text/html) without large inspect snapshots.
- Use screenshot when visual confirmation is useful.
- If a step fails, inspect again, adjust target, and retry.
- If you are confident about the destination URL, open it directly with navigation instead of clicking through intermediate pages. Take deterministic shortcuts when confident.
- Prefer deterministic steps and short feedback loops.
- Prefer browser tools first for normal workflows.

Browser SDK Script Environment (TypeScript-first automation):
- You are allowed and expected to write and run TypeScript browser scripts using @ank1015/llm-extension.
- Critical rule: for browser automation, do NOT write Python scripts. Use TypeScript scripts in the script workspace and run them with the provided runner.
- For big or repetitive tasks, default to scripts instead of manual tool-by-tool actions.

Script-first triggers (use scripts proactively):
- Scraping many pages/doc sections, crawling pagination, or collecting data from many URLs.
- Repeated multi-step workflows (same sequence across pages/accounts/items).
- Batch extraction/download tasks where loops, retries, or concurrency are needed.
- Any task that is slow/unreliable with direct tools after brief retries.
- Any workflow needing advanced Chrome APIs (debugger sessions, network events, cookies, custom evaluate logic).

Script location and execution:
- Write scripts in:
  ${scriptWorkspaceDir}
- Run scripts from any current working directory with:
  ${scriptRunnerPath} <script.ts> [args...]
- Example runs:
  ${scriptRunnerPath} runner-smoke.ts
  ${scriptRunnerPath} collect-cookies.ts
- The runner accepts both relative script names (resolved in the script workspace) and absolute paths.
- Use filesystem tools (write/edit/read/bash) to create and iterate quickly.
- Save outputs/artifacts under:
  ${toolsCwd}

Recommended script workflow:
1) Create a TypeScript script in the script workspace.
2) Connect with connect({ launch: true }).
3) Implement deterministic loops for navigation/extraction.
4) Persist outputs (json/md/txt) to the working directory.
5) Run, inspect output, edit, and rerun until complete.

SDK quick reference:
- Generic call pattern:
  const result = await chrome.call('tabs.query', { active: true, currentWindow: true });
- Common calls: tabs.query/create/update/get/remove, windows.create/update/get/remove, downloads.download/search, cookies.getAll.
- For page evaluation and extraction, prefer debugger.evaluate:
  const evalResult = await chrome.call('debugger.evaluate', { tabId, code: 'document.title' });
- For long-lived CDP/network workflows:
  await chrome.call('debugger.attach', { tabId });
  await chrome.call('debugger.sendCommand', { tabId, method: 'Network.enable' });
  const events = await chrome.call('debugger.getEvents', { tabId, filter: 'Network.' });
  await chrome.call('debugger.detach', { tabId });
- Always detach debugger sessions in finally blocks.
- Minimal script template:
  import { connect } from '@ank1015/llm-extension';
  const chrome = await connect({ launch: true });
  const tab = (await chrome.call('tabs.create', { url: 'https://example.com', active: true })) as { id?: number };
  if (!tab.id) throw new Error('Missing tab id');
  const title = await chrome.call('debugger.evaluate', { tabId: tab.id, code: 'document.title' });
  console.log(title);

When to use direct tools vs scripts:
- Direct tools: short, one-off interactions.
- Scripts: large, repeated, or reliability-critical automation (especially scraping/crawling tasks).

Working Directory:
- Filesystem working directory: ${toolsCwd}
- All the downloads, scrapping data or any artifact generation by be inside our working directory: ${toolsCwd}

Today:
- ${today}
`.trim();
}

const SYSTEM_PROMPT = buildSystemPrompt(
  TEST_TOOLS_CWD,
  AGENT_SCRIPT_WORKSPACE_DIR,
  AGENT_SCRIPT_RUNNER_PATH,
  formatToday(new Date())
);

type CliOptions = {
  projectName: string;
  path: string;
  sessionId?: string;
  sessionsDir?: string;
  keysDir?: string;
  api: Api;
  modelId: string;
};

interface ChromeWindow {
  id?: number;
}

function printUsage(): void {
  const usage = `
Usage:
  node dist/test-cli.js [options]

Options:
  --project <name>              Session project name (default: ${DEFAULT_PROJECT_NAME})
  --path <path>                 Session path within project (default: root)
  --session <id>                Existing session ID to continue
  --sessions-dir <dir>          Session storage base directory
  --keys-dir <dir>              Keys storage directory
  --api <provider>              Provider API (default: ${DEFAULT_API})
  --model <id>                  Model ID (default depends on API)
  -h, --help                    Show help

Commands while running:
  /help                         Show in-chat commands
  /tools                        Show loaded tools
  /window                       Show scoped browser window id
  /session                      Show current session info
  /exit or /quit                Exit CLI
`.trim();

  console.log(usage);
}

function getFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseCliArgs(args: string[]): CliOptions {
  let projectName = DEFAULT_PROJECT_NAME;
  let path = '';
  let sessionId: string | undefined;
  let sessionsDir: string | undefined;
  let keysDir: string | undefined;
  let apiRaw: string = DEFAULT_API;
  let modelId = DEFAULT_MODEL_BY_API[DEFAULT_API];
  let modelExplicit = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);

      case '--api':
        apiRaw = getFlagValue(args, i, arg);
        i++;
        break;

      case '--project':
        projectName = getFlagValue(args, i, arg);
        i++;
        break;

      case '--path':
        path = getFlagValue(args, i, arg);
        i++;
        break;

      case '--session':
        sessionId = getFlagValue(args, i, arg);
        i++;
        break;

      case '--sessions-dir':
        sessionsDir = resolve(getFlagValue(args, i, arg));
        i++;
        break;

      case '--keys-dir':
        keysDir = resolve(getFlagValue(args, i, arg));
        i++;
        break;

      case '--model':
        modelId = getFlagValue(args, i, arg);
        modelExplicit = true;
        i++;
        break;

      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!isValidApi(apiRaw)) {
    throw new Error(`Invalid API "${apiRaw}". Supported APIs: ${KnownApis.join(', ')}`);
  }

  const api = apiRaw as Api;
  if (!modelExplicit) {
    modelId = DEFAULT_MODEL_BY_API[api];
  }

  return {
    projectName,
    path,
    ...(sessionId ? { sessionId } : {}),
    ...(sessionsDir ? { sessionsDir } : {}),
    ...(keysDir ? { keysDir } : {}),
    api,
    modelId,
  };
}

function truncate(value: string, max = 220): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function indentBlock(value: string, spaces = 2): string {
  const indent = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
}

function toTextBlock(value: string): string {
  return `\`\`\`text\n${value}\n\`\`\``;
}

function toJsonBlock(value: unknown): string {
  return `\`\`\`json\n${toJson(value)}\n\`\`\``;
}

function safeJson(value: unknown): string {
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return '[unserializable]';
  }
}

function isCtrlCAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeCode = (error as Error & { code?: unknown }).code;
  if (maybeCode === 'ABORT_ERR') {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes('ctrl+c') || message.includes('aborted');
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  const textParts: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || !block) {
      continue;
    }

    const maybeType = (block as { type?: unknown }).type;
    const maybeContent = (block as { content?: unknown }).content;
    if (maybeType === 'text' && typeof maybeContent === 'string') {
      textParts.push(maybeContent);
    }
  }

  return textParts.join('\n').trim();
}

function getAssistantText(message: BaseAssistantMessage<Api>): string {
  const lines: string[] = [];

  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    for (const part of block.content) {
      if (part.type === 'text') {
        lines.push(part.content);
      }
    }
  }

  return lines.join('\n').trim();
}

function formatAssistantOutput(newMessages: Message[]): string {
  const assistantTexts: string[] = [];

  for (const message of newMessages) {
    if (message.role !== 'assistant') {
      continue;
    }

    const text = getAssistantText(message);
    if (text) {
      assistantTexts.push(text);
    }
  }

  return assistantTexts.join('\n').trim();
}

function renderContentAsText(content: unknown): string {
  if (!Array.isArray(content) || content.length === 0) {
    return '';
  }

  const lines: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || !block || !('type' in block)) {
      continue;
    }

    const type = (block as { type: unknown }).type;
    if (type === 'text') {
      const text = (block as { content?: unknown }).content;
      if (typeof text === 'string' && text.trim()) {
        lines.push(text);
      }
      continue;
    }

    if (type === 'image') {
      lines.push('[Image attachment]');
      continue;
    }

    if (type === 'file') {
      const filename = (block as { filename?: unknown }).filename;
      lines.push(`[File: ${typeof filename === 'string' ? filename : 'unknown'}]`);
      continue;
    }
  }

  return lines.join('\n').trim();
}

function renderUserMessage(message: Extract<Message, { role: 'user' }>, index: number): string {
  const body = renderContentAsText(message.content) || '[empty]';
  return [`### ${index + 1}. user`, body].join('\n');
}

function renderAssistantMessage(
  message: Extract<Message, { role: 'assistant' }>,
  index: number
): string {
  const parts: string[] = [`### ${index + 1}. assistant`];

  for (const block of message.content) {
    if (block.type === 'thinking') {
      parts.push('**thinking**');
      parts.push(indentBlock(toTextBlock(block.thinkingText || '[empty]'), 2));
      continue;
    }

    if (block.type === 'toolCall') {
      parts.push(`**toolCall** \`${block.name}\``);
      parts.push(`- toolCallId: ${block.toolCallId}`);
      parts.push('- arguments:');
      parts.push(indentBlock(toJsonBlock(block.arguments), 2));
      continue;
    }

    if (block.type === 'response') {
      const responseText = renderContentAsText(block.content);
      if (responseText) {
        parts.push(responseText);
      }
    }
  }

  if (message.errorMessage) {
    parts.push(`**error:** ${message.errorMessage}`);
  }

  if (parts.length === 1) {
    parts.push('[empty]');
  }

  return parts.join('\n');
}

function renderToolResultMessage(
  message: Extract<Message, { role: 'toolResult' }>,
  index: number
): string {
  const text = renderContentAsText(message.content) || '[empty]';
  const status = message.isError ? 'error' : 'ok';

  const parts = [
    `### ${index + 1}. toolResult`,
    `**tool:** \`${message.toolName}\``,
    `**status:** ${status}`,
    '**result**',
    indentBlock(toTextBlock(text), 2),
  ];

  if (message.isError && message.error?.message) {
    parts.push(`**error:** ${message.error.message}`);
  }

  return parts.join('\n');
}

function renderCustomMessage(message: Extract<Message, { role: 'custom' }>, index: number): string {
  return [
    `### ${index + 1}. custom`,
    '**content**',
    indentBlock(toJsonBlock(message.content), 2),
  ].join('\n');
}

function renderMessage(message: Message, index: number): string {
  if (message.role === 'user') {
    return renderUserMessage(message, index);
  }

  if (message.role === 'toolResult') {
    return renderToolResultMessage(message, index);
  }

  if (message.role === 'assistant') {
    return renderAssistantMessage(message, index);
  }

  return renderCustomMessage(message, index);
}

function buildConversationMarkdown(params: {
  sessionId: string;
  projectName: string;
  sessionPath: string;
  api: Api;
  modelId: string;
  systemPrompt?: string;
  messages: Message[];
}): string {
  const generatedAt = formatIsoDateTime(new Date());
  const body = params.messages.map((message, index) => renderMessage(message, index)).join('\n\n');

  return [
    '# Conversation Export',
    '',
    `- generatedAt: ${generatedAt}`,
    `- sessionId: ${params.sessionId}`,
    `- project: ${params.projectName}`,
    `- path: ${params.sessionPath || '(root)'}`,
    `- api: ${params.api}`,
    `- model: ${params.modelId}`,
    '',
    '## System',
    '',
    toTextBlock(params.systemPrompt?.trim() || '[none]'),
    '',
    '## Messages',
    '',
    body || '[no messages]',
    '',
  ].join('\n');
}

async function saveConversationMarkdown(params: {
  sessionId: string;
  projectName: string;
  sessionPath: string;
  api: Api;
  modelId: string;
  systemPrompt?: string;
  messages: Message[];
}): Promise<string> {
  await mkdir(AGENT_SESSIONS_DIR, { recursive: true });
  const filename = `${params.sessionId}-${formatFileTimestamp(new Date())}.md`;
  const target = resolve(AGENT_SESSIONS_DIR, filename);
  const markdown = buildConversationMarkdown(params);
  await writeFile(target, markdown, 'utf8');
  return target;
}

function isAssistantStreamEvent(
  message: Message | BaseAssistantEvent<Api>
): message is BaseAssistantEvent<Api> {
  return (
    typeof message === 'object' && message !== null && !('role' in message) && 'type' in message
  );
}

async function resolveSessionId(
  sessionManager: SessionManager,
  options: CliOptions
): Promise<string> {
  if (options.sessionId) {
    const existing = await sessionManager.getSession(
      options.projectName,
      options.sessionId,
      options.path
    );
    if (!existing) {
      throw new Error(
        `Session "${options.sessionId}" was not found for project "${options.projectName}" and path "${options.path}".`
      );
    }
    return options.sessionId;
  }

  const created = await sessionManager.createSession({
    projectName: options.projectName,
    path: options.path,
    sessionName: DEFAULT_SESSION_NAME,
  });
  return created.sessionId;
}

async function resolveWindowId(chrome: ChromeClient): Promise<number> {
  const created = (await chrome.call('windows.create', {
    url: 'about:blank',
    focused: true,
  })) as ChromeWindow;
  if (typeof created.id !== 'number') {
    throw new Error('Could not determine an active browser window id');
  }

  return created.id;
}

function createCliTools(chrome: ChromeClient, windowId: number): AgentTool[] {
  const browserOperations = {
    getClient: async () => chrome,
  };

  const readTool = createReadTool(TEST_TOOLS_CWD);
  const writeTool = createWriteTool(TEST_TOOLS_CWD);
  const editTool = createEditTool(TEST_TOOLS_CWD);
  const bashTool = createBashTool(TEST_TOOLS_CWD);

  const navigationTool = createNavigationTool({ windowId, operations: browserOperations });
  const inspectTool = createInspectTool({ windowId, operations: browserOperations });
  const actTool = createActTool({ windowId, operations: browserOperations });
  const screenshotTool = createScreenshotTool({ windowId, operations: browserOperations });
  const downloadTool = createDownloadTool({ windowId, operations: browserOperations });
  const extractTool = createExtractTool({ windowId, operations: browserOperations });

  return [
    readTool,
    writeTool,
    editTool,
    bashTool,
    navigationTool,
    inspectTool,
    actTool,
    screenshotTool,
    downloadTool,
    extractTool,
  ] as unknown as AgentTool[];
}

async function runCli(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const model = getModels(options.api).find((entry) => entry.id === options.modelId);
  if (!model) {
    const availableIds = getModels(options.api)
      .map((entry) => entry.id)
      .join(', ');
    throw new Error(
      `Model "${options.modelId}" not found for API "${options.api}". Available models: ${availableIds}`
    );
  }

  const chromePort = process.env.CHROME_RPC_PORT
    ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
    : undefined;
  const chrome = await connect({ launch: true, ...(chromePort ? { port: chromePort } : {}) });
  const windowId = await resolveWindowId(chrome);

  await mkdir(TEST_TOOLS_CWD, { recursive: true });
  await mkdir(AGENT_SCRIPT_WORKSPACE_DIR, { recursive: true });

  const keysAdapter = createFileKeysAdapter(options.keysDir);
  const sessionsAdapter = createFileSessionsAdapter(options.sessionsDir);
  const sessionManager = createSessionManager(sessionsAdapter);
  const sessionId = await resolveSessionId(sessionManager, options);

  const messageNodes = await sessionManager.getMessages(
    options.projectName,
    sessionId,
    'main',
    options.path
  );
  const existingMessages: Message[] = (messageNodes ?? []).map((node) => node.message);

  const latestNode = await sessionManager.getLatestNode(
    options.projectName,
    sessionId,
    'main',
    options.path
  );
  if (!latestNode) {
    throw new Error(`Session "${sessionId}" has no root node. Cannot append new messages.`);
  }

  const conversation = new Conversation({
    streamAssistantMessage: true,
    keysAdapter,
  });
  conversation.setProvider({
    model: getModel('codex', 'gpt-5.3-codex')!,
    providerOptions: {
      reasoning: {
        effort: 'high',
        summary: 'auto',
      },
    } as CodexProviderOptions,
  });

  if (SYSTEM_PROMPT.trim()) {
    conversation.setSystemPrompt(SYSTEM_PROMPT);
  }

  const tools = createCliTools(chrome, windowId);
  conversation.setTools(tools);
  if (existingMessages.length > 0) {
    conversation.replaceMessages(existingMessages);
  }

  let parentId = latestNode.id;
  const persistMessage: ConversationExternalCallback = async (message) => {
    const result = await sessionManager.appendMessage({
      projectName: options.projectName,
      path: options.path,
      sessionId,
      parentId,
      branch: 'main',
      message,
      api: options.api,
      modelId: options.modelId,
    });

    parentId = result.node.id;
  };

  let interrupted = false;
  let shutdownRequested = false;
  let markdownExportPath: string | undefined;
  let resolveShutdownSignal: (() => void) | undefined;
  const shutdownSignal = new Promise<void>((resolve) => {
    resolveShutdownSignal = resolve;
  });

  const exportConversationIfInterrupted = async (): Promise<void> => {
    if (!interrupted || markdownExportPath) {
      return;
    }

    markdownExportPath = await saveConversationMarkdown({
      sessionId,
      projectName: options.projectName,
      sessionPath: options.path,
      api: options.api,
      modelId: options.modelId,
      ...(conversation.state.systemPrompt !== undefined
        ? { systemPrompt: conversation.state.systemPrompt }
        : {}),
      messages: conversation.state.messages,
    });

    console.log(`Saved markdown transcript: ${markdownExportPath}`);
  };

  console.log(`Session: ${sessionId}`);
  console.log(`Project/Path: ${options.projectName}/${options.path || '(root)'}`);
  console.log(`API/Model: ${options.api}/${options.modelId}`);
  console.log(`Tool CWD: ${TEST_TOOLS_CWD}`);
  console.log(`Script Workspace: ${AGENT_SCRIPT_WORKSPACE_DIR}`);
  console.log(`Script Runner: ${AGENT_SCRIPT_RUNNER_PATH}`);
  console.log(`Browser windowId: ${windowId}`);
  console.log(`Loaded tools: ${tools.map((tool) => tool.name).join(', ')}`);
  if (existingMessages.length > 0) {
    console.log(`Loaded ${existingMessages.length} previous message(s).`);
  }
  console.log('Type /help for commands.');

  const rl = createInterface({ input, output });
  const requestInterruptShutdown = (): void => {
    if (shutdownRequested) {
      return;
    }
    shutdownRequested = true;
    interrupted = true;
    resolveShutdownSignal?.();
    console.log('\nInterrupt received. Aborting current run and saving transcript...');
    conversation.abort();
    rl.close();
  };

  const handleSigint = (): void => {
    if (shutdownRequested) {
      process.exitCode = 130;
      process.exit();
    }
    requestInterruptShutdown();
  };

  process.on('SIGINT', handleSigint);
  rl.on('SIGINT', requestInterruptShutdown);

  try {
    while (true) {
      const inputOrShutdown = await Promise.race([
        rl
          .question('\nYou: ')
          .then((value) => ({ kind: 'input' as const, value }))
          .catch((error) => ({ kind: 'error' as const, error })),
        shutdownSignal.then(() => ({ kind: 'shutdown' as const })),
      ]);

      if (inputOrShutdown.kind === 'shutdown') {
        break;
      }

      if (inputOrShutdown.kind === 'error') {
        if (shutdownRequested || isCtrlCAbortError(inputOrShutdown.error)) {
          requestInterruptShutdown();
          break;
        }
        throw inputOrShutdown.error;
      }

      const userInput = inputOrShutdown.value.trim();

      if (!userInput) {
        continue;
      }

      if (userInput === '/exit' || userInput === '/quit') {
        break;
      }

      if (userInput === '/help') {
        console.log('/help, /tools, /window, /session, /exit, /quit');
        continue;
      }

      if (userInput === '/tools') {
        console.log(`tools=${tools.map((tool) => tool.name).join(', ')}`);
        continue;
      }

      if (userInput === '/window') {
        console.log(`windowId=${windowId}`);
        continue;
      }

      if (userInput === '/session') {
        console.log(
          `sessionId=${sessionId} project=${options.projectName} path=${options.path || '(root)'}`
        );
        continue;
      }

      let streamedAssistantText = false;
      let assistantLineOpen = false;

      const unsubscribe = conversation.subscribe((event: AgentEvent) => {
        if (event.type === 'tool_execution_start') {
          console.log(`\n[tool:start] ${event.toolName} args=${safeJson(event.args)}`);
          return;
        }

        if (event.type === 'tool_execution_update') {
          const updateText = extractTextContent(event.partialResult.content);
          console.log(
            `\n[tool:update] ${event.toolName}${updateText ? ` ${truncate(updateText)}` : ''}`
          );
          return;
        }

        if (event.type === 'tool_execution_end') {
          const status = event.isError ? 'error' : 'ok';
          const resultText = extractTextContent(event.result.content);
          console.log(`\n[tool:end] ${event.toolName} status=${status}`);
          if (resultText) {
            console.log(`[tool:result] ${truncate(resultText)}`);
          }
          return;
        }

        if (event.type !== 'message_update' || event.messageType !== 'assistant') {
          return;
        }

        if (!isAssistantStreamEvent(event.message)) {
          return;
        }

        const streamEvent = event.message;
        if (streamEvent.type === 'text_delta') {
          if (!assistantLineOpen) {
            output.write('\nAssistant: ');
            assistantLineOpen = true;
          }
          output.write(streamEvent.delta);
          streamedAssistantText = true;
          return;
        }

        if (streamEvent.type === 'done' || streamEvent.type === 'error') {
          if (assistantLineOpen) {
            output.write('\n');
            assistantLineOpen = false;
          }
        }
      });

      try {
        const newMessages = await conversation.prompt(userInput, undefined, persistMessage);
        const assistantOutput = formatAssistantOutput(newMessages);

        if (assistantLineOpen) {
          output.write('\n');
          assistantLineOpen = false;
        }

        if (!streamedAssistantText) {
          if (assistantOutput) {
            console.log(`\nAssistant:\n${assistantOutput}`);
          } else {
            console.log('\nAssistant returned no text output.');
          }
        }
      } catch (error) {
        if (shutdownRequested || isCtrlCAbortError(error)) {
          requestInterruptShutdown();
          break;
        }
        throw error;
      } finally {
        if (assistantLineOpen) {
          output.write('\n');
        }
        unsubscribe();
      }
    }
  } finally {
    rl.off('SIGINT', requestInterruptShutdown);
    process.off('SIGINT', handleSigint);
    try {
      await conversation.waitForIdle();
    } catch {
      // Ignore interruptions during shutdown; export uses current in-memory messages.
    }
    await exportConversationIfInterrupted();
    rl.close();
    if (interrupted) {
      process.exitCode = 130;
      process.exit();
    }
  }
}

void runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
