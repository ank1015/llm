import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { Conversation, createSessionManager, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter, InMemorySessionsAdapter } from '@ank1015/llm-sdk-adapters';

import { saveCliSessionMarkdown } from './session-markdown.js';

import type {
  AgentEvent,
  AgentTool,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  Provider,
} from '@ank1015/llm-sdk';

export const CLI_API = 'codex' as const;
export const CLI_MODEL_ID = 'gpt-5.4' as const;
export const CLI_PROVIDER_OPTIONS: Record<string, unknown> = {
  reasoning: {
    effort: 'high',
    summary: 'detailed',
  },
};
const EXIT_COMMANDS = new Set(['exit', 'quit', ':q']);

export interface RunInteractiveCliSessionOptions {
  projectName: string;
  sessionName: string;
  sessionArchiveSubdir: string;
  workingDir: string;
  systemPrompt: string;
  tools: AgentTool[];
  introLines?: string[];
  oneShotPrompt?: string;
}

export interface CliSessionRunResult {
  finalResponse?: string;
  sessionTranscriptPath?: string;
}

export function isExitCommand(input: string): boolean {
  return EXIT_COMMANDS.has(input.trim().toLowerCase());
}

export function extractAssistantText(message: BaseAssistantMessage<Api>): string {
  const textParts: string[] = [];
  let sawNonTextContent = false;

  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    for (const item of block.content) {
      if (item.type === 'text') {
        textParts.push(item.content);
      } else {
        sawNonTextContent = true;
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join('\n\n').trim();
  }

  if (sawNonTextContent) {
    return '[assistant returned non-text content]';
  }

  return '';
}

export function extractLatestAssistantResponse(messages: Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') {
      continue;
    }

    const assistantMessage = message as BaseAssistantMessage<Api>;
    const text = extractAssistantText(assistantMessage);
    if (text) {
      return text;
    }

    if (assistantMessage.errorMessage) {
      return assistantMessage.errorMessage;
    }

    return '[assistant returned no text response]';
  }

  return undefined;
}

export function isReadlineInterruptError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ERR_USE_AFTER_CLOSE' || error.code === 'ABORT_ERR')
  );
}

export async function runInteractiveCliSession({
  projectName,
  sessionName,
  sessionArchiveSubdir,
  workingDir,
  systemPrompt,
  tools,
  introLines,
  oneShotPrompt,
}: RunInteractiveCliSessionOptions): Promise<CliSessionRunResult> {
  const readline =
    oneShotPrompt === undefined ? createInterface({ input: stdin, output: stdout }) : undefined;
  let conversation: Conversation | undefined;
  let isRunning = false;
  let sessionId: string | undefined;
  let sessionTranscriptPath: string | undefined;
  let finalResponse: string | undefined;

  const handleSigint = (): void => {
    if (isRunning && conversation) {
      stdout.write('\nAborting current run...\n');
      conversation.abort();
      return;
    }

    stdout.write('\nExiting.\n');
    readline?.close();
  };

  process.on('SIGINT', handleSigint);

  try {
    const model = resolveCliModel();
    const keysAdapter = createFileKeysAdapter();
    const sessionManager = createSessionManager(new InMemorySessionsAdapter());
    const createdSession = await sessionManager.createSession({
      projectName,
      sessionName,
    });
    sessionId = createdSession.sessionId;
    const createdSessionId = createdSession.sessionId;

    let currentLeafNodeId = createdSession.header.id;

    const activeConversation = new Conversation({
      keysAdapter,
      streamAssistantMessage: true,
      initialState: {
        tools,
      },
    });
    conversation = activeConversation;
    activeConversation.setProvider({
      model,
      providerOptions: CLI_PROVIDER_OPTIONS,
    } as Provider<Api>);
    activeConversation.setSystemPrompt(systemPrompt);
    activeConversation.setTools(tools);
    if (oneShotPrompt === undefined) {
      activeConversation.subscribe(createEventPrinter());
    }

    stdout.write(`Session ${sessionId} ready.\n`);
    printIntroLines(workingDir, introLines);

    if (oneShotPrompt !== undefined) {
      finalResponse = await runOneShotPrompt({
        promptText: oneShotPrompt,
        onRunningChange: (running) => {
          isRunning = running;
        },
        executePrompt: async (promptText) => {
          ({ currentLeafNodeId, finalResponse } = await runPromptTurn({
            conversation: activeConversation,
            promptText,
            sessionManager,
            projectName,
            sessionId: createdSessionId,
            currentLeafNodeId,
          }));

          return finalResponse;
        },
      });
    } else {
      if (!readline) {
        throw new Error('Interactive CLI readline is unavailable.');
      }

      await runInteractivePromptLoop({
        readline,
        onRunningChange: (running) => {
          isRunning = running;
        },
        executePrompt: async (promptText) => {
          ({ currentLeafNodeId } = await runPromptTurn({
            conversation: activeConversation,
            promptText,
            sessionManager,
            projectName,
            sessionId: createdSessionId,
            currentLeafNodeId,
          }));
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          stdout.write(`\nerror> ${message}\n`);
        },
      });
    }
  } finally {
    process.off('SIGINT', handleSigint);
    sessionTranscriptPath = await saveSessionTranscript({
      conversation,
      projectName,
      sessionId,
      sessionName,
      sessionArchiveSubdir,
      workingDir,
    });
    if (sessionTranscriptPath) {
      stdout.write(`Saved session transcript to ${sessionTranscriptPath}\n`);
    }
    readline?.close();
  }

  return {
    ...(finalResponse !== undefined ? { finalResponse } : {}),
    ...(sessionTranscriptPath !== undefined ? { sessionTranscriptPath } : {}),
  };
}

async function runOneShotPrompt({
  promptText,
  onRunningChange,
  executePrompt,
}: {
  promptText: string;
  onRunningChange: (running: boolean) => void;
  executePrompt: (promptText: string) => Promise<string | undefined>;
}): Promise<string | undefined> {
  onRunningChange(true);
  try {
    return await executePrompt(promptText);
  } finally {
    onRunningChange(false);
  }
}

async function runInteractivePromptLoop({
  readline,
  onRunningChange,
  executePrompt,
  onError,
}: {
  readline: ReturnType<typeof createInterface>;
  onRunningChange: (running: boolean) => void;
  executePrompt: (promptText: string) => Promise<void>;
  onError: (error: unknown) => void;
}): Promise<void> {
  while (true) {
    const promptText = await readPromptText(readline);
    if (promptText === undefined) {
      break;
    }
    if (!promptText.trim()) {
      continue;
    }
    if (isExitCommand(promptText)) {
      break;
    }

    onRunningChange(true);
    try {
      await executePrompt(promptText);
    } catch (error) {
      onError(error);
    } finally {
      onRunningChange(false);
    }
  }
}

function createEventPrinter() {
  let sawAssistantText = false;
  let assistantLineOpen = false;

  return (event: AgentEvent): void => {
    switch (event.type) {
      case 'message_start': {
        ({ assistantLineOpen, sawAssistantText } = handleMessageStart(event, {
          assistantLineOpen,
          sawAssistantText,
        }));
        break;
      }
      case 'message_update': {
        sawAssistantText = handleMessageUpdate(event, sawAssistantText);
        break;
      }
      case 'tool_execution_start': {
        if (assistantLineOpen) {
          stdout.write('\n');
          assistantLineOpen = false;
        }
        stdout.write(`[tool:${event.toolName}] running\n`);
        break;
      }
      case 'tool_execution_end': {
        stdout.write(`[tool:${event.toolName}] ${event.isError ? 'failed' : 'done'}\n`);
        break;
      }
      case 'message_end': {
        ({ assistantLineOpen, sawAssistantText } = handleMessageEnd(event, {
          assistantLineOpen,
          sawAssistantText,
        }));
        break;
      }
    }
  };
}

function resolveCliModel(): NonNullable<ReturnType<typeof getModel>> {
  const model = getModel(CLI_API, CLI_MODEL_ID);
  if (!model) {
    throw new Error(`Model "${CLI_MODEL_ID}" not found for API "${CLI_API}"`);
  }

  return model;
}

function printIntroLines(workingDir: string, introLines?: string[]): void {
  const lines = introLines ?? [
    `Using ${CLI_API}/${CLI_MODEL_ID} with directory-local tools in ${workingDir}`,
    'Type a prompt and press Enter. Type "exit" to quit.',
  ];

  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}

async function readPromptText(
  readline: ReturnType<typeof createInterface>
): Promise<string | undefined> {
  try {
    return await readline.question('\nyou> ');
  } catch (error) {
    if (isReadlineInterruptError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function runPromptTurn({
  conversation,
  promptText,
  sessionManager,
  projectName,
  sessionId,
  currentLeafNodeId,
}: {
  conversation: Conversation;
  promptText: string;
  sessionManager: ReturnType<typeof createSessionManager>;
  projectName: string;
  sessionId: string;
  currentLeafNodeId: string;
}): Promise<{ currentLeafNodeId: string; finalResponse?: string }> {
  const newMessages = await conversation.prompt(promptText, undefined, async (message: Message) => {
    currentLeafNodeId = await appendSessionMessage({
      sessionManager,
      projectName,
      sessionId,
      parentId: currentLeafNodeId,
      message,
    });
  });
  const finalResponse = extractLatestAssistantResponse(newMessages);

  return {
    currentLeafNodeId,
    ...(finalResponse !== undefined ? { finalResponse } : {}),
  };
}

async function appendSessionMessage({
  sessionManager,
  projectName,
  sessionId,
  parentId,
  message,
}: {
  sessionManager: ReturnType<typeof createSessionManager>;
  projectName: string;
  sessionId: string;
  parentId: string;
  message: Message;
}): Promise<string> {
  const { node } = await sessionManager.appendMessage({
    projectName,
    path: '',
    sessionId,
    parentId,
    branch: 'main',
    message,
    api: CLI_API,
    modelId: CLI_MODEL_ID,
    providerOptions: CLI_PROVIDER_OPTIONS,
  });

  return node.id;
}

function handleMessageStart(
  event: Extract<AgentEvent, { type: 'message_start' }>,
  state: { assistantLineOpen: boolean; sawAssistantText: boolean }
): { assistantLineOpen: boolean; sawAssistantText: boolean } {
  if (event.messageType !== 'assistant') {
    return state;
  }

  stdout.write('\nassistant> ');
  return {
    assistantLineOpen: true,
    sawAssistantText: false,
  };
}

function handleMessageUpdate(
  event: Extract<AgentEvent, { type: 'message_update' }>,
  sawAssistantText: boolean
): boolean {
  if (
    event.messageType !== 'assistant' ||
    !isAssistantStreamEvent(event.message) ||
    event.message.type !== 'text_delta'
  ) {
    return sawAssistantText;
  }

  stdout.write(event.message.delta);
  return true;
}

function handleMessageEnd(
  event: Extract<AgentEvent, { type: 'message_end' }>,
  state: { assistantLineOpen: boolean; sawAssistantText: boolean }
): { assistantLineOpen: boolean; sawAssistantText: boolean } {
  if (event.messageType !== 'assistant') {
    return state;
  }

  if (!state.sawAssistantText) {
    const text = extractAssistantText(event.message as BaseAssistantMessage<Api>);
    if (text) {
      stdout.write(text);
    }
  }
  stdout.write('\n');

  return {
    assistantLineOpen: false,
    sawAssistantText: false,
  };
}

async function saveSessionTranscript({
  conversation,
  projectName,
  sessionId,
  sessionName,
  sessionArchiveSubdir,
  workingDir,
}: {
  conversation: Conversation | undefined;
  projectName: string;
  sessionId: string | undefined;
  sessionName: string;
  sessionArchiveSubdir: string;
  workingDir: string;
}): Promise<string | undefined> {
  if (!conversation || !sessionId) {
    return undefined;
  }

  try {
    return await saveCliSessionMarkdown({
      sessionId,
      sessionName,
      projectName,
      workingDir,
      archiveSubdir: sessionArchiveSubdir,
      messages: conversation.state.messages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stdout.write(`warning> Failed to save session transcript: ${message}\n`);
    return undefined;
  }
}

function isAssistantStreamEvent(
  message: Message | BaseAssistantEvent<Api>
): message is BaseAssistantEvent<Api> {
  return 'type' in message;
}
