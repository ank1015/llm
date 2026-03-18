#!/usr/bin/env node

import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

import { Conversation, createSessionManager, getModel } from '@ank1015/llm-sdk';
import { createFileKeysAdapter, InMemorySessionsAdapter } from '@ank1015/llm-sdk-adapters';

import { addSkill } from '../agents/skills/index.js';
import { createSystemPrompt } from '../agents/system-prompt.js';
import { createAllTools } from '../tools/index.js';

import type {
  AgentEvent,
  AgentTool,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  Provider,
} from '@ank1015/llm-sdk';

const CLI_API = 'codex' as const;
const CLI_MODEL_ID = 'gpt-5.4' as const;
const CLI_PROVIDER_OPTIONS: Record<string, unknown> = {
  reasoning: {
    effort: 'high',
    summary: 'detailed',
  },
};
const EXIT_COMMANDS = new Set(['exit', 'quit', ':q']);

export interface CliDirectoryContext {
  projectName: string;
  projectDir: string;
  artifactName: string;
  artifactDir: string;
}

export function isExitCommand(input: string): boolean {
  return EXIT_COMMANDS.has(input.trim().toLowerCase());
}

export function resolveCliDirectoryContext(directory: string): CliDirectoryContext {
  const artifactDir = resolve(directory);
  const artifactName = basename(artifactDir) || 'artifact';
  const projectDir = dirname(artifactDir);
  const projectName = basename(projectDir) || artifactName;

  return {
    projectName,
    projectDir,
    artifactName,
    artifactDir,
  };
}

function createCliSystemPromptOverrides(context: CliDirectoryContext): {
  project_information: string;
  working_dir: string;
  agent_state: string;
} {
  const stateDir = join(context.artifactDir, '.max');
  const skillsDir = join(stateDir, 'skills');
  const tempDir = join(stateDir, 'temp');

  return {
    project_information: `- Max is working in this directory: ${context.artifactDir}.`,
    working_dir: `Max is currently working in the following directory:
- working dir: ${context.artifactDir}

- The tools are initialized in this directory, and Max should treat it as the default working area.
- Max should read and write files relative to this directory unless the user explicitly asks for another location.
- If Max needs to inspect files outside this directory, Max should do so explicitly and avoid modifying them unless the user asks.`,
    agent_state: `- Agent-local state lives under: ${stateDir}
- Installed skills live under: ${skillsDir}
- Max may use ${tempDir} as writable scratch space for temporary files, helper projects, scripts, installs, previews, logs, JSON summaries, unpacked folders, and other ephemeral outputs.
- ${tempDir} may already be initialized as a lightweight TypeScript workspace for helper-backed skills, including a \`package.json\`, \`tsconfig.json\`, and \`scripts/\` folder.
- When that temp workspace already exists, Max should inspect it and reuse it instead of creating a new scratch setup.
- Max may place one-off TypeScript helper scripts inside ${tempDir}/scripts and run them from ${tempDir} when that workspace fits the task.
- Final user-facing outputs should be written inside ${context.artifactDir} unless the user explicitly asks for a different location.
- Max should treat ${tempDir} as ephemeral scratch space. Other contents under ${stateDir} are agent state, not normal project files.
- Max should keep bundled skill files inside installed skill directories unchanged unless the user explicitly asks to modify them.`,
  };
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

function isReadlineInterruptError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ERR_USE_AFTER_CLOSE' || error.code === 'ABORT_ERR')
  );
}

function isAssistantStreamEvent(
  message: Message | BaseAssistantEvent<Api>
): message is BaseAssistantEvent<Api> {
  return 'type' in message;
}

async function resolveExistingDirectory(directoryInput: string): Promise<CliDirectoryContext> {
  const requestedPath = directoryInput.trim() || process.cwd();
  const resolvedPath = resolve(requestedPath);
  const stats = await stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedPath}`);
  }

  return resolveCliDirectoryContext(await realpath(resolvedPath));
}

function createEventPrinter() {
  let sawAssistantText = false;
  let assistantLineOpen = false;

  return (event: AgentEvent): void => {
    switch (event.type) {
      case 'message_start': {
        if (event.messageType === 'assistant') {
          sawAssistantText = false;
          assistantLineOpen = true;
          stdout.write('\nassistant> ');
        }
        break;
      }
      case 'message_update': {
        if (
          event.messageType === 'assistant' &&
          isAssistantStreamEvent(event.message) &&
          event.message.type === 'text_delta'
        ) {
          sawAssistantText = true;
          stdout.write(event.message.delta);
        }
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
        if (event.messageType === 'assistant') {
          if (!sawAssistantText) {
            const text = extractAssistantText(event.message as BaseAssistantMessage<Api>);
            if (text) {
              stdout.write(text);
            }
          }
          stdout.write('\n');
          sawAssistantText = false;
          assistantLineOpen = false;
        }
        break;
      }
    }
  };
}

export async function runAgentCli(): Promise<void> {
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
    let directoryInput: string;
    try {
      directoryInput = await readline.question(`Run agent in directory [${process.cwd()}]: `);
    } catch (error) {
      if (isReadlineInterruptError(error)) {
        return;
      }
      throw error;
    }
    const context = await resolveExistingDirectory(directoryInput);

    stdout.write(`\nPreparing agent for ${context.artifactDir}\n`);
    await addSkill('ai-images', context.artifactDir);
    await addSkill('web', context.artifactDir);

    // createAllTools returns concrete AgentTool specializations; Conversation expects
    // the shared AgentTool interface, so we widen the union here for the CLI runtime.
    const tools = Object.values(createAllTools(context.artifactDir)) as unknown as AgentTool[];
    const systemPrompt = await createSystemPrompt({
      ...context,
      ...createCliSystemPromptOverrides(context),
    });
    const model = getModel(CLI_API, CLI_MODEL_ID);
    if (!model) {
      throw new Error(`Model "${CLI_MODEL_ID}" not found for API "${CLI_API}"`);
    }

    const keysAdapter = createFileKeysAdapter();
    const sessionManager = createSessionManager(new InMemorySessionsAdapter());
    const { sessionId, header } = await sessionManager.createSession({
      projectName: context.projectName,
      sessionName: `${context.artifactName} CLI Session`,
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
    stdout.write(
      `Using ${CLI_API}/${CLI_MODEL_ID} with directory-local tools in ${context.artifactDir}\n`
    );
    stdout.write('Type a prompt and press Enter. Type "exit" to quit.\n');

    while (true) {
      let promptText: string;
      try {
        promptText = await readline.question('\nyou> ');
      } catch (error) {
        if (isReadlineInterruptError(error)) {
          break;
        }
        throw error;
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
          const { node } = await sessionManager.appendMessage({
            projectName: context.projectName,
            path: '',
            sessionId,
            parentId: currentLeafNodeId,
            branch: 'main',
            message,
            api: CLI_API,
            modelId: CLI_MODEL_ID,
            providerOptions: CLI_PROVIDER_OPTIONS,
          });
          currentLeafNodeId = node.id;
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runAgentCli();
}
