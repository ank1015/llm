import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import { Conversation, createSessionManager, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter, InMemorySessionsAdapter } from '@ank1015/llm-sdk-adapters';

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
  workingDir: string;
  systemPrompt: string;
  tools: AgentTool[];
  introLines?: string[];
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
  workingDir,
  systemPrompt,
  tools,
  introLines,
}: RunInteractiveCliSessionOptions): Promise<void> {
  const readline = createInterface({ input: stdin, output: stdout });
  let conversation: Conversation | undefined;
  let isRunning = false;

  const handleSigint = (): void => {
    if (isRunning && conversation) {
      stdout.write('\nAborting current run...\n');
      conversation.abort();
      return;
    }

    stdout.write('\nExiting.\n');
    readline.close();
    process.exit(0);
  };

  process.on('SIGINT', handleSigint);

  try {
    const model = resolveCliModel();
    const keysAdapter = createFileKeysAdapter();
    const sessionManager = createSessionManager(new InMemorySessionsAdapter());
    const { sessionId, header } = await sessionManager.createSession({
      projectName,
      sessionName,
    });

    let currentLeafNodeId = header.id;

    conversation = new Conversation({
      keysAdapter,
      streamAssistantMessage: true,
      initialState: {
        tools,
      },
    });
    conversation.setProvider({
      model,
      providerOptions: CLI_PROVIDER_OPTIONS,
    } as Provider<Api>);
    conversation.setSystemPrompt(systemPrompt);
    conversation.setTools(tools);
    conversation.subscribe(createEventPrinter());

    stdout.write(`Session ${sessionId} ready.\n`);
    printIntroLines(workingDir, introLines);

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

      isRunning = true;
      try {
        await conversation.prompt(promptText, undefined, async (message: Message) => {
          currentLeafNodeId = await appendSessionMessage({
            sessionManager,
            projectName,
            sessionId,
            parentId: currentLeafNodeId,
            message,
          });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stdout.write(`\nerror> ${message}\n`);
      } finally {
        isRunning = false;
      }
    }
  } finally {
    process.off('SIGINT', handleSigint);
    readline.close();
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

function isAssistantStreamEvent(
  message: Message | BaseAssistantEvent<Api>
): message is BaseAssistantEvent<Api> {
  return 'type' in message;
}
