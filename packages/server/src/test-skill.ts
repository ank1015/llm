import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agent, userMessage } from '@ank1015/llm-sdk';
import { readSession } from '@ank1015/llm-sdk/session';

import { createServerAgentConfig } from './core/session/agent-config.js';

import type { AgentResult, AssistantToolCall, Content, Message } from '@ank1015/llm-sdk';

const DEFAULT_MODEL_ID = 'codex/gpt-5.4' as const;
const DEFAULT_REASONING_EFFORT = 'medium' as const;
const DEFAULT_MAX_TURNS = Number.MAX_SAFE_INTEGER;
export const TEST_SKILL_DOCS_DIR = fileURLToPath(new URL('../test-skill-docs/', import.meta.url));

type ParsedTestSkillArgs = {
  prompt: string;
  cwd: string;
  outputPath?: string;
};

type LoadedTestSkillDocs = {
  readme: {
    fileName: string;
    content: string;
  } | null;
  numberedDocs: Array<{
    fileName: string;
    content: string;
  }>;
};

class TestSkillUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestSkillUsageError';
  }
}

export function parseTestSkillArgs(
  argv: string[],
  currentWorkingDirectory: string = process.cwd()
): ParsedTestSkillArgs {
  let prompt: string | undefined;
  let cwd = currentWorkingDirectory;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) {
      continue;
    }

    if (argument === '--') {
      continue;
    }

    if (argument === '--help' || argument === '-h') {
      throw new TestSkillUsageError(getTestSkillUsage());
    }

    const { flag, inlineValue } = splitFlag(argument);
    const { value, nextIndex } = readFlagValue(argv, index, flag, inlineValue);

    switch (flag) {
      case '--prompt': {
        prompt = value;
        index = nextIndex;
        break;
      }

      case '--cwd': {
        cwd = resolve(currentWorkingDirectory, value);
        index = nextIndex;
        break;
      }

      case '--output': {
        outputPath = resolve(currentWorkingDirectory, value);
        index = nextIndex;
        break;
      }

      default: {
        throw new TestSkillUsageError(`Unknown argument: ${argument}`);
      }
    }
  }

  if (!prompt?.trim()) {
    throw new TestSkillUsageError('A non-empty --prompt value is required');
  }

  return {
    prompt: prompt.trim(),
    cwd,
    ...(outputPath ? { outputPath } : {}),
  };
}

export async function buildChromeSkillSection(
  docsDir: string = TEST_SKILL_DOCS_DIR
): Promise<string> {
  const docs = await loadChromeSkillDocs(docsDir);
  const sections = ['## Chrome skill'];

  if (docs.readme) {
    sections.push(`### README\n${docs.readme.content}`);
  }

  docs.numberedDocs.forEach((doc, index) => {
    sections.push(`### ${index + 1}. ${doc.fileName}\n${doc.content}`);
  });

  return sections.join('\n\n');
}

export function buildConversationMarkdown(input: {
  systemPrompt: string;
  messages: Message[];
  result?: AgentResult;
}): string {
  const sections = [`System\n${input.systemPrompt.trim()}`];

  for (const message of input.messages) {
    sections.push(renderConversationMessage(message));
  }

  if (input.result && !input.result.ok) {
    sections.push(
      `Run Error\nPhase: ${input.result.error.phase}\n\nMessage: ${input.result.error.message}`
    );
  }

  return `${sections.join('\n\n---\n\n')}\n`;
}

export async function runTestSkill(args: ParsedTestSkillArgs): Promise<{
  outputPath: string;
  result: AgentResult;
  sessionPath: string;
}> {
  await assertDirectory(args.cwd);

  const workspaceName = resolveWorkspaceName(args.cwd);
  const chromeSkillSection = await buildChromeSkillSection();
  const agentConfig = await createServerAgentConfig({
    projectName: workspaceName,
    projectDir: args.cwd,
    artifactName: workspaceName,
    artifactDir: args.cwd,
    toolCwd: args.cwd,
    systemPromptAppendix: chromeSkillSection,
  });

  const inputMessage = userMessage(args.prompt);
  const run = agent({
    modelId: DEFAULT_MODEL_ID,
    inputMessages: [inputMessage],
    system: agentConfig.systemPrompt,
    tools: agentConfig.tools,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    maxTurns: DEFAULT_MAX_TURNS,
  });
  const result = await run;
  const transcriptMessages = await loadTranscriptMessages(run.sessionPath, [
    inputMessage,
    ...result.newMessages,
  ]);

  const outputPath = args.outputPath ?? join(args.cwd, `test-skill-session-${result.sessionId}.md`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    buildConversationMarkdown({
      systemPrompt: agentConfig.systemPrompt,
      messages: transcriptMessages,
      result,
    }),
    'utf8'
  );

  return {
    outputPath,
    result,
    sessionPath: run.sessionPath,
  };
}

function splitFlag(argument: string): { flag: string; inlineValue?: string } {
  const separatorIndex = argument.indexOf('=');
  if (separatorIndex === -1) {
    return { flag: argument };
  }

  return {
    flag: argument.slice(0, separatorIndex),
    inlineValue: argument.slice(separatorIndex + 1),
  };
}

function readFlagValue(
  argv: string[],
  index: number,
  flag: string,
  inlineValue?: string
): { value: string; nextIndex: number } {
  if (flag !== '--prompt' && flag !== '--cwd' && flag !== '--output') {
    return { value: '', nextIndex: index };
  }

  const value = inlineValue ?? argv[index + 1];
  if (!value) {
    throw new TestSkillUsageError(`Missing value for ${flag}`);
  }

  return {
    value,
    nextIndex: inlineValue === undefined ? index + 1 : index,
  };
}

async function loadChromeSkillDocs(docsDir: string): Promise<LoadedTestSkillDocs> {
  const entries = await readdir(docsDir, { withFileTypes: true });
  const markdownFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  const readmeFileName =
    markdownFiles.find((fileName) => fileName.toLowerCase() === 'readme.md') ?? null;
  const numberedFileNames = markdownFiles
    .filter((fileName) => fileName !== readmeFileName)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return {
    readme: readmeFileName
      ? {
          fileName: readmeFileName,
          content: await readMarkdownFile(join(docsDir, readmeFileName)),
        }
      : null,
    numberedDocs: await Promise.all(
      numberedFileNames.map(async (fileName) => ({
        fileName,
        content: await readMarkdownFile(join(docsDir, fileName)),
      }))
    ),
  };
}

async function readMarkdownFile(path: string): Promise<string> {
  return (await readFile(path, 'utf8')).trim();
}

async function assertDirectory(path: string): Promise<void> {
  let directoryStats;

  try {
    directoryStats = await stat(path);
  } catch (error) {
    throw new Error(
      `Working directory "${path}" could not be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(`Working directory "${path}" is not a directory`);
  }
}

async function loadTranscriptMessages(
  sessionPath: string,
  fallbackMessages: Message[]
): Promise<Message[]> {
  const session = await readSession(sessionPath);
  if (!session) {
    return fallbackMessages;
  }

  return session.nodes
    .filter((node): node is Extract<(typeof session.nodes)[number], { type: 'message' }> => {
      return node.type === 'message';
    })
    .map((node) => node.message);
}

function resolveWorkspaceName(path: string): string {
  const pathBaseName = basename(path);
  return pathBaseName.length > 0 ? pathBaseName : path;
}

function renderConversationMessage(message: Message): string {
  switch (message.role) {
    case 'user': {
      return `User\n${renderContentBlocks(message.content)}`;
    }

    case 'assistant': {
      return renderAssistantMessage(message);
    }

    case 'toolResult': {
      return renderToolResultMessage(message);
    }

    case 'custom': {
      return `Custom\n${renderJsonBlock(message.content)}`;
    }
  }
}

function renderAssistantMessage(message: Extract<Message, { role: 'assistant' }>): string {
  const sections = ['Assistant'];

  for (const item of message.content) {
    if (item.type === 'thinking') {
      sections.push(`Thinking\n${item.thinkingText}`);
      continue;
    }

    if (item.type === 'toolCall') {
      sections.push(`Tool Call\n${renderToolCall(item)}`);
      continue;
    }

    const responseText = renderContentBlocks(item.response);
    if (responseText.length > 0) {
      sections.push(responseText);
    }
  }

  if (message.error) {
    sections.push(`Error\n${message.error.message}`);
  }

  return sections.join('\n\n');
}

function renderToolCall(toolCall: AssistantToolCall): string {
  return `Name: ${toolCall.name}\nArguments:\n${renderJsonBlock(toolCall.arguments)}`;
}

function renderToolResultMessage(message: Extract<Message, { role: 'toolResult' }>): string {
  const sections = [
    'Tool Result',
    `Tool: ${message.toolName}`,
    `Status: ${message.isError ? 'error' : 'ok'}`,
  ];
  const contentText = renderContentBlocks(message.content);

  if (contentText.length > 0) {
    sections.push(contentText);
  }

  if (message.details !== undefined) {
    sections.push(`Details\n${renderJsonBlock(message.details)}`);
  }

  if (message.error) {
    sections.push(`Error\n${renderJsonBlock(message.error)}`);
  }

  return sections.join('\n\n');
}

function renderContentBlocks(content: Content): string {
  return content
    .map((block) => renderContentBlock(block))
    .join('\n\n')
    .trim();
}

function renderContentBlock(block: Content[number]): string {
  switch (block.type) {
    case 'text': {
      return block.content;
    }

    case 'image': {
      const fileName =
        typeof block.metadata?.['fileName'] === 'string' ? block.metadata['fileName'] : undefined;
      return `[image${fileName ? `: ${fileName}` : ''}${block.mimeType ? `, ${block.mimeType}` : ''}]`;
    }

    case 'file': {
      return `[file: ${block.filename}${block.mimeType ? `, ${block.mimeType}` : ''}]`;
    }
  }
}

function renderJsonBlock(value: unknown): string {
  return `\`\`\`json
${JSON.stringify(value, null, 2)}
\`\`\``;
}

function getTestSkillUsage(): string {
  return [
    'Usage: node dist/test-skill.js --prompt "..." [--cwd PATH] [--output PATH]',
    '',
    'Flags:',
    '  --prompt   Required. User prompt to send to the agent.',
    '  --cwd      Optional. Working directory for the agent tools. Defaults to the current shell directory.',
    '  --output   Optional. Markdown transcript path. Defaults to <cwd>/test-skill-session-<sessionId>.md.',
  ].join('\n');
}

async function main(): Promise<void> {
  try {
    const args = parseTestSkillArgs(process.argv.slice(2));
    const { outputPath, result, sessionPath } = await runTestSkill(args);

    console.warn(`Session saved at ${sessionPath}`);
    console.warn(`Transcript saved at ${outputPath}`);

    if (!result.ok) {
      console.error(`Run failed during ${result.error.phase}: ${result.error.message}`);
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof TestSkillUsageError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }

  return resolve(entryPath) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  await main();
}
