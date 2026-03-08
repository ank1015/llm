/* eslint-disable no-fallthrough */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  Conversation,
  createSessionManager,
  getModel,
  getModels,
  isValidApi,
  KnownApis,
} from '@ank1015/llm-sdk';
import { createFileKeysAdapter, createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

import { addSkill, listInstalledSkills } from './agents/skills/index.js';
import { createSystemPrompt } from './agents/system-prompt.js';
import { createAllTools } from './agents/tools.js';

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

const AGENT_PROJECT_NAME = 'sales';
const AGENT_ARTIFACT_NAME = 'product';
const AGENT_PROJECT_DIR = '/Users/notacoder/Desktop/sales';
const AGENT_ARTIFACT_DIR = '/Users/notacoder/Desktop/sales/product';
const AGENTS_PACKAGE_DIR = '/Users/notacoder/Desktop/agents/llm/packages/agents';
const AGENT_SESSIONS_DIR = `${AGENTS_PACKAGE_DIR}/sessions`;
const DEFAULT_PROJECT_NAME = AGENT_PROJECT_NAME;
const DEFAULT_SESSION_PATH = AGENT_ARTIFACT_NAME;
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

function formatIsoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatFileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

type CliOptions = {
  projectName: string;
  path: string;
  sessionId?: string;
  sessionsDir?: string;
  keysDir?: string;
  api: Api;
  modelId: string;
  skills: string[];
};

function printUsage(): void {
  const usage = `
Usage:
  node dist/test-cli.js [options]

Options:
  --project <name>              Session project name (default: ${DEFAULT_PROJECT_NAME})
  --path <path>                 Session path within project (default: ${DEFAULT_SESSION_PATH})
  --session <id>                Existing session ID to continue
  --sessions-dir <dir>          Session storage base directory
  --keys-dir <dir>              Keys storage directory
  --api <provider>              Provider API (default: ${DEFAULT_API})
  --model <id>                  Model ID (default depends on API)
  --skill <name>                Install a bundled skill into the artifact (repeatable)
  -h, --help                    Show help

Commands while running:
  /help                         Show in-chat commands
  /tools                        Show loaded tools
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
  let path = DEFAULT_SESSION_PATH;
  let sessionId: string | undefined;
  let sessionsDir: string | undefined;
  let keysDir: string | undefined;
  let apiRaw: string = DEFAULT_API;
  let modelId = DEFAULT_MODEL_BY_API[DEFAULT_API];
  let modelExplicit = false;
  const skills: string[] = [];

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

      case '--skill':
        skills.push(getFlagValue(args, i, arg));
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
    skills: Array.from(new Set(skills)),
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

function createCliTools(): AgentTool[] {
  return Object.values(createAllTools(AGENT_ARTIFACT_DIR)) as unknown as AgentTool[];
}

async function runCli(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const model = getModel('codex', 'gpt-5.4');
  if (!model) {
    const availableIds = getModels(options.api)
      .map((entry) => entry.id)
      .join(', ');
    throw new Error(
      `Model "${options.modelId}" not found for API "${options.api}". Available models: ${availableIds}`
    );
  }

  await mkdir(AGENT_PROJECT_DIR, { recursive: true });
  await mkdir(AGENT_ARTIFACT_DIR, { recursive: true });
  for (const skillName of options.skills) {
    console.log(`Installing skill: ${skillName}`);
    await addSkill(skillName, AGENT_ARTIFACT_DIR);
  }

  const installedSkills = await listInstalledSkills(AGENT_ARTIFACT_DIR);
  const systemPrompt = await createSystemPrompt({
    projectName: AGENT_PROJECT_NAME,
    projectDir: AGENT_PROJECT_DIR,
    artifactName: AGENT_ARTIFACT_NAME,
    artifactDir: AGENT_ARTIFACT_DIR,
  });

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
  conversation.setProvider(
    options.api === 'codex'
      ? {
          model,
          providerOptions: {
            reasoning: {
              effort: 'high',
              summary: 'auto',
            },
          } as CodexProviderOptions,
        }
      : { model }
  );

  if (systemPrompt.trim()) {
    conversation.setSystemPrompt(systemPrompt);
  }

  const tools = createCliTools();
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
  console.log(`Agent Project: ${AGENT_PROJECT_NAME}`);
  console.log(`Agent Artifact: ${AGENT_ARTIFACT_NAME}`);
  console.log(`Project Dir: ${AGENT_PROJECT_DIR}`);
  console.log(`Artifact Dir: ${AGENT_ARTIFACT_DIR}`);
  console.log(
    `Installed skills: ${installedSkills.length > 0 ? installedSkills.map((skill) => skill.name).join(', ') : '[none]'}`
  );
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
        console.log('/help, /tools, /session, /exit, /quit');
        continue;
      }

      if (userInput === '/tools') {
        console.log(`tools=${tools.map((tool) => tool.name).join(', ')}`);
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
