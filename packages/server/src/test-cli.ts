/* eslint-disable no-fallthrough */
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  Conversation,
  createSessionManager,
  getModel,
  isValidApi,
  KnownApis,
} from '@ank1015/llm-sdk';
import { createFileKeysAdapter, createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

import { createBashTool } from './core/tools/bash.js';
import { createEditTool } from './core/tools/edit.js';
import { createReadTool } from './core/tools/read.js';
import { searchTool } from './core/tools/search.js';
import { createWriteTool } from './core/tools/write.js';

import type { CodexProviderOptions } from '../../types/dist/providers/codex.js';
import type {
  AgentEvent,
  AgentTool,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Message,
  ConversationExternalCallback,
  SessionManager,
} from '@ank1015/llm-sdk';

const DEFAULT_PROJECT_NAME = 'test-cli';
const DEFAULT_API: Api = 'google';
const DEFAULT_MODEL_ID = 'gemini-3-flash-preview';
const DEFAULT_SESSION_NAME = 'Test CLI Session';

// TODO: Replace with your system prompt.
const SYSTEM_PROMPT = `
  You are an expert assistant operating, operating inside agent harness running in user's device. You help users with their tasks by reading files, executing commands, editing code, and writing new files. You also have special access to control the user's browser using a typescript sdk and help users during their work in the browser.

  Available Core tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

  Core Tools Guidelines:
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files

  Browser Related Tools:
- search: Find relevant urls from search engine.

- A typescript based sdk (@ank1015/llm-extension) exposing all chrome api's.
To control the user's browser, you must write scripts that use the sdk and run them.
You must use the write (edit for editing) tool to write scripts in /Users/notacoder/Desktop/agents/llm/packages/environment/scripts/ directory and run them using the bash command to run this script file like /Users/notacoder/Desktop/agents/llm/packages/environment/bin/run.sh my-script.ts . 

Here is how you use the sdk and write a script.
Example
"
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });

// query
const tabs = await chrome.call('tabs.query', {
  active: true,
  currentWindow: true,
});

// create
const newTab = await chrome.call('tabs.create', {
  url: 'https://x.com',
});

// update (navigate/focus/mute/pin/etc)
await chrome.call('tabs.update', newTab.id, {
  active: true,
  url: 'https://x.com/i/bookmarks',
});

// reload
await chrome.call('tabs.reload', newTab.id);

// remove
await chrome.call('tabs.remove', newTab.id);
"

- You must first import the connect method from the @ank1015/llm-extension. This sdk is already present in the given environment.
- Then to connect to chrome run 'await connect({ launch: true });', this will connect to chrome and return a chrome instance.
- You can then call any chrome api using this chrome instance with the call method. If you want to call chrome.tabs.create you do something like
const newTab = await chrome.call('tabs.create', {
  url: 'https://x.com',
});
- You can write the script as you want to perform the user action. You are allowed to write even multiple scripts and use them to understand the page structure and all.

  Search Tools Guidelines
- Use search to get quick search engine results. Search with the objective and 2-3 search queries.
- Use the search's after_date param to filter the search.
- You must write scripts in the given directory '/Users/notacoder/Desktop/agents/llm/packages/environment/scripts/', it has the environment setup.
- You must run the script using the script runner by providing your script name '/Users/notacoder/Desktop/agents/llm/packages/environment/bin/run.sh my-script.ts'.
- For example if the user asks you to find some sources regarding the topic, use the search tools to find relevant urls and then open those url's in chrome for user to further inspect.
- You don't always have to rely on the search tool, it is just for help. You are free to explore and use different urls as well.

`;

function createCliTools(_toolsCwd: string): AgentTool[] {
  const readTool = createReadTool(_toolsCwd);
  const writeTool = createWriteTool(_toolsCwd);
  const editTool = createEditTool(_toolsCwd);
  const bashTool = createBashTool(_toolsCwd);

  return [readTool, writeTool, editTool, bashTool, searchTool] as unknown as AgentTool[];
}

type CliOptions = {
  projectName: string;
  path: string;
  sessionId?: string;
  sessionsDir?: string;
  keysDir?: string;
  toolsCwd: string;
  api: Api;
  modelId: string;
};

function printUsage(): void {
  const usage = `
Usage:
  node dist/test-cli.js [options]

Options:
  --project <name>         Session project name (default: ${DEFAULT_PROJECT_NAME})
  --path <path>            Session path within project (default: root)
  --session <id>           Existing session ID to continue
  --sessions-dir <dir>     Session storage base directory
  --keys-dir <dir>         Keys storage directory for createFileKeysAdapter
  --tools-cwd <dir>        Working directory for tools (default: current directory)
  --api <provider>         Provider API (default: ${DEFAULT_API})
  --model <id>             Model ID (default: ${DEFAULT_MODEL_ID})
  -h, --help               Show help

Commands while running:
  /help                    Show in-chat commands
  /session                 Print current session info
  /exit or /quit           Exit CLI
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
  let toolsCwd = process.cwd();
  let apiRaw: string = DEFAULT_API;
  let modelId = DEFAULT_MODEL_ID;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
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
      case '--tools-cwd':
        toolsCwd = resolve(getFlagValue(args, i, arg));
        i++;
        break;
      case '--api':
        apiRaw = getFlagValue(args, i, arg);
        i++;
        break;
      case '--model':
        modelId = getFlagValue(args, i, arg);
        i++;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!isValidApi(apiRaw)) {
    throw new Error(`Invalid API "${apiRaw}". Supported APIs: ${KnownApis.join(', ')}`);
  }

  const options: CliOptions = {
    projectName,
    path,
    toolsCwd,
    api: apiRaw,
    modelId,
  };

  if (sessionId) {
    options.sessionId = sessionId;
  }
  if (sessionsDir) {
    options.sessionsDir = sessionsDir;
  }
  if (keysDir) {
    options.keysDir = keysDir;
  }

  return options;
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

function truncate(value: string, max = 220): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function safeJson(value: unknown): string {
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return '[unserializable]';
  }
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

function isAssistantStreamEvent(
  message: Message | BaseAssistantEvent<Api>
): message is BaseAssistantEvent<Api> {
  return (
    typeof message === 'object' && message !== null && !('role' in message) && 'type' in message
  );
}

// function resolveModel(api: Api, modelId: string) {
//   const availableModels = getModels(api);
//   const match = availableModels.find((model) => model.id === modelId);

//   if (!match) {
//     const availableModelIds = availableModels.map((model) => model.id);
//     throw new Error(
//       `Model "${modelId}" not found for API "${api}". Available models: ${availableModelIds.join(', ')}`
//     );
//   }

//   return match;
// }

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

async function runCli(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
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
    keysAdapter: createFileKeysAdapter(options.keysDir),
    streamAssistantMessage: true,
  });

  conversation.setProvider({
    model: getModel('codex', 'gpt-5.3-codex')!,
    providerOptions: {
      reasoning: {
        effort: 'medium',
      },
    } as CodexProviderOptions,
  });
  conversation.setSystemPrompt(SYSTEM_PROMPT);
  conversation.setTools(createCliTools(options.toolsCwd));

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

  console.log(`Session ready: ${sessionId}`);
  console.log(`Project: ${options.projectName}`);
  console.log(`Path: ${options.path || '(root)'}`);
  console.log(`API/Model: ${options.api}/${options.modelId}`);
  console.log(`Tools CWD: ${options.toolsCwd}`);
  if (existingMessages.length > 0) {
    console.log(`Loaded ${existingMessages.length} previous message(s).`);
  }
  console.log('Type /help for commands.');

  const rl = createInterface({ input, output });

  try {
    while (true) {
      const userInputRaw = await rl.question('\nYou: ');
      const userInput = userInputRaw.trim();

      if (!userInput) {
        continue;
      }

      if (userInput === '/exit' || userInput === '/quit') {
        break;
      }

      if (userInput === '/help') {
        console.log('/help, /session, /exit, /quit');
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
      } finally {
        if (assistantLineOpen) {
          output.write('\n');
        }
        unsubscribe();
      }
    }
  } finally {
    rl.close();
  }
}

void runCli().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
