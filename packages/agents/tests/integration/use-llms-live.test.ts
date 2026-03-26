import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '../..');
const srcIndexUrl = pathToFileURL(join(packageRoot, 'src', 'index.ts')).href;
const tsxPath = join(
  packageRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
);
const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');

interface CodexCredentials {
  accessToken: string;
  accountId: string;
}

function loadCodexCredentials(): CodexCredentials | undefined {
  const accessToken =
    process.env.CODEX_ACCESS_TOKEN ??
    process.env.CODEX_API_KEY ??
    process.env.CODEX_ACCESS_KEY ??
    undefined;
  const accountId =
    process.env.CODEX_ACCOUNT_ID ?? process.env.CODEX_CHATGPT_ACCOUNT_ID ?? undefined;

  if (accessToken && accountId) {
    return { accessToken, accountId };
  }

  if (!existsSync(CODEX_AUTH_PATH)) {
    return undefined;
  }

  try {
    const auth = JSON.parse(readFileSync(CODEX_AUTH_PATH, 'utf-8')) as {
      tokens?: {
        access_token?: string;
        account_id?: string;
      };
    };

    const resolvedAccessToken = auth.tokens?.access_token;
    const resolvedAccountId = auth.tokens?.account_id;
    if (!resolvedAccessToken || !resolvedAccountId) {
      return undefined;
    }

    return {
      accessToken: resolvedAccessToken,
      accountId: resolvedAccountId,
    };
  } catch {
    return undefined;
  }
}

const codexCredentials = loadCodexCredentials();
const describeIfCodex = codexCredentials ? describe : describe.skip;

function buildLiveScript(body: string): string {
  return `
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { Type } from '@sinclair/typebox';

const {
  buildUserMessage,
  createFileKeysAdapter,
  createManagedConversation,
  streamLlm,
} = await import(process.env.LLM_AGENTS_ENTRY_URL!);

const keysAdapter = createFileKeysAdapter();
await keysAdapter.setCredentials('codex', {
  access_token: process.env.CODEX_ACCESS_TOKEN!,
  account_id: process.env.CODEX_ACCOUNT_ID!,
});

function getAssistantText(message) {
  return message.content
    .filter((item) => item.type === 'response')
    .flatMap((item) => item.content)
    .filter((block) => block.type === 'text')
    .map((block) => block.content)
    .join('\\n');
}

function hasToolCall(message, toolName) {
  return message.content.some((item) => item.type === 'toolCall' && item.name === toolName);
}

function createCalculateTool() {
  return {
    name: 'calculate',
    label: 'Calculator',
    description: 'Evaluate an arithmetic expression and return the numeric result.',
    parameters: Type.Object({
      expression: Type.String({ minLength: 1 }),
    }),
    async execute(_toolCallId, params) {
      const expression = String(params.expression);
      assert.match(
        expression,
        /^[0-9+\\-*/ ().]+$/,
        \`Unsupported calculator expression: \${expression}\`
      );

      const result = Function(\`"use strict"; return (\${expression});\`)();
      assert.equal(typeof result, 'number');
      assert.ok(Number.isFinite(result));

      return {
        content: [{ type: 'text', content: String(result) }],
        details: {
          expression,
          result,
        },
      };
    },
  };
}

${body}
`;
}

async function runLiveScript<T>(body: string): Promise<T> {
  if (!codexCredentials) {
    throw new Error('Codex credentials are required to run live use-llms integration tests.');
  }

  const tempHome = await mkdtemp(join(tmpdir(), 'llm-agents-live-home-'));
  const tempScriptDir = await mkdtemp(join(packageRoot, 'tests', 'integration', '.live-'));
  const scriptPath = join(tempScriptDir, 'use-llms-live-script.ts');

  try {
    await writeFile(scriptPath, buildLiveScript(body), 'utf-8');

    const result = spawnSync(tsxPath, [scriptPath], {
      cwd: packageRoot,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: tempHome,
        LLM_AGENTS_ENTRY_URL: srcIndexUrl,
        CODEX_ACCESS_TOKEN: codexCredentials.accessToken,
        CODEX_ACCOUNT_ID: codexCredentials.accountId,
      },
      timeout: 180_000,
    });

    const stdout = result.stdout.trim();
    const stderr = result.stderr.trim();

    if (result.status !== 0) {
      throw new Error(
        [
          `Live helper script failed with status ${result.status ?? 'null'}.`,
          stdout ? `stdout:\\n${stdout}` : '',
          stderr ? `stderr:\\n${stderr}` : '',
        ]
          .filter(Boolean)
          .join('\\n\\n')
      );
    }

    const lines = stdout.split(/\\r?\\n/).filter(Boolean);
    const jsonLine = lines[lines.length - 1];
    if (!jsonLine) {
      throw new Error('Live helper script produced no JSON output.');
    }

    return JSON.parse(jsonLine) as T;
  } finally {
    await rm(tempScriptDir, { recursive: true, force: true });
    await rm(tempHome, { recursive: true, force: true });
  }
}

describeIfCodex('use-llms live integration', () => {
  it('uses the default file keys adapter for streamLlm and returns a live assistant message', async () => {
    const report = await runLiveScript<{
      text: string;
      eventTypes: string[];
      modelId: string;
      totalTokens: number;
    }>(`
const stream = await streamLlm({
  modelId: 'gpt-5.4-mini',
  messages: [buildUserMessage('Reply with exactly LIVE_STREAM_OK.')],
  systemPrompt: 'Return the exact token requested and nothing else.',
  thinkingLevel: 'low',
});

const eventTypes = [];
for await (const event of stream) {
  eventTypes.push(event.type);
}

const result = await stream.result();
const text = getAssistantText(result);

assert.equal(result.role, 'assistant');
assert.equal(result.model.id, 'gpt-5.4-mini');
assert.ok(result.usage.totalTokens > 0);
assert.equal(eventTypes[0], 'start');
assert.ok(eventTypes.includes('done'));
assert.match(text, /LIVE_STREAM_OK/i);

console.log(JSON.stringify({
  text,
  eventTypes,
  modelId: result.model.id,
  totalTokens: result.usage.totalTokens,
}));
`);

    expect(report.modelId).toBe('gpt-5.4-mini');
    expect(report.totalTokens).toBeGreaterThan(0);
    expect(report.eventTypes[0]).toBe('start');
    expect(report.eventTypes).toContain('done');
    expect(report.text).toMatch(/LIVE_STREAM_OK/i);
  }, 180_000);

  it('surfaces live tool calls from streamLlm when tool schemas are provided', async () => {
    const report = await runLiveScript<{
      stopReason: string;
      calledTool: string;
      modelId: string;
    }>(`
const tools = [
  {
    name: 'get_magic_number',
    description: 'Return a magic number for the caller.',
    parameters: Type.Object({
      reason: Type.String({ minLength: 1 }),
    }),
  },
];

let finalResult;

for (let attempt = 0; attempt < 2; attempt += 1) {
  const stream = await streamLlm({
    modelId: 'gpt-5.4',
    messages: [
      buildUserMessage(
        'You must call the get_magic_number tool. Do not answer directly and do not explain.'
      ),
    ],
    tools,
    systemPrompt: 'Always use the provided tool when the user explicitly requires it.',
    thinkingLevel: 'low',
  });

  for await (const _event of stream) {
    // consume
  }

  const result = await stream.result();
  if (result.stopReason === 'toolUse' && hasToolCall(result, 'get_magic_number')) {
    finalResult = result;
    break;
  }
}

assert.ok(finalResult, 'Expected streamLlm to return a tool call.');

console.log(JSON.stringify({
  stopReason: finalResult.stopReason,
  calledTool: finalResult.content.find((item) => item.type === 'toolCall')?.name,
  modelId: finalResult.model.id,
}));
`);

    expect(report.modelId).toBe('gpt-5.4');
    expect(report.stopReason).toBe('toolUse');
    expect(report.calledTool).toBe('get_magic_number');
  }, 180_000);

  it('supports continue() from initialState and emits live conversation events', async () => {
    const report = await runLiveScript<{
      text: string;
      eventTypes: string[];
      messageCount: number;
      modelId: string;
    }>(`
const seedMessage = buildUserMessage('Reply with exactly LIVE_CONTINUE_OK.');

const conversation = createManagedConversation({
  modelId: 'gpt-5.4-mini',
  systemPrompt: 'Return the exact token requested and nothing else.',
  thinkingLevel: 'low',
  initialState: {
    messages: [seedMessage],
    usage: {
      totalTokens: 0,
      totalCost: 0,
      lastInputTokens: 0,
    },
  },
});

const eventTypes = [];
conversation.subscribe((event) => {
  eventTypes.push(event.type);
});

const newMessages = await conversation.continue();
await conversation.waitForIdle();

const lastMessage = newMessages[newMessages.length - 1];
assert.ok(lastMessage);
assert.equal(lastMessage.role, 'assistant');

const text = getAssistantText(lastMessage);
assert.match(text, /LIVE_CONTINUE_OK/i);
assert.ok(conversation.state.messages.length >= 2);
assert.ok(eventTypes.includes('agent_start'));
assert.ok(eventTypes.includes('agent_end'));
assert.equal(conversation.state.isStreaming, false);

console.log(JSON.stringify({
  text,
  eventTypes,
  messageCount: conversation.state.messages.length,
  modelId: conversation.state.provider.model.id,
}));
`);

    expect(report.modelId).toBe('gpt-5.4-mini');
    expect(report.messageCount).toBeGreaterThanOrEqual(2);
    expect(report.eventTypes).toContain('agent_start');
    expect(report.eventTypes).toContain('agent_end');
    expect(report.text).toMatch(/LIVE_CONTINUE_OK/i);
  }, 180_000);

  it('executes tools and persists file-backed sessions end to end', async () => {
    const report = await runLiveScript<{
      answerText: string;
      eventTypes: string[];
      sessionCount: number;
      sessionNodeCount: number;
      mainMessageCount: number;
      retryHistoryCount: number;
      branchNames: string[];
      branchPointId: string | null;
      latestRetryNodeId: string;
      filePath: string;
      sessionsBaseDir: string;
      restoredMessageCount: number;
    }>(`
const managed = createManagedConversation({
  modelId: 'gpt-5.4',
  systemPrompt:
    'Use the calculate tool whenever the user asks for arithmetic. After using it, reply with only the final numeric answer.',
  thinkingLevel: 'low',
  tools: [createCalculateTool()],
  sessions: 'file',
});

const eventTypes = [];
managed.conversation.subscribe((event) => {
  eventTypes.push(event.type);
});

let newMessages;
for (let attempt = 0; attempt < 2; attempt += 1) {
  newMessages = await managed.conversation.prompt(
    'What is 2 * 3 + 4? You must use the calculate tool and not do the math yourself.'
  );

  if (managed.conversation.state.messages.some((message) => message.role === 'toolResult')) {
    break;
  }
}

assert.ok(newMessages);
const lastMessage = newMessages[newMessages.length - 1];
assert.ok(lastMessage);
assert.equal(lastMessage.role, 'assistant');

const answerText = getAssistantText(lastMessage);
assert.match(answerText, /10/);
assert.ok(managed.conversation.state.messages.some((message) => message.role === 'toolResult'));
assert.ok(eventTypes.includes('tool_execution_start'));
assert.ok(eventTypes.includes('tool_execution_end'));
assert.ok(eventTypes.includes('message_update'));

const sessionsBaseDir = managed.sessionsAdapter.getSessionsBaseDir();
assert.equal(sessionsBaseDir, join(process.env.HOME!, '.llm', 'sessions'));

const { sessionId, header } = await managed.sessionManager.createSession({
  projectName: 'use-llms-live',
  path: 'conversation-tests',
  sessionName: 'Math Tool Run',
});

let parentId = header.id;
for (const message of managed.conversation.state.messages) {
  const { node } = await managed.sessionManager.appendMessage({
    projectName: 'use-llms-live',
    path: 'conversation-tests',
    sessionId,
    parentId,
    branch: 'main',
    message,
    api: managed.conversation.state.provider.model.api,
    modelId: managed.conversation.state.provider.model.id,
    providerOptions: managed.conversation.state.provider.providerOptions,
  });

  parentId = node.id;
}

const { node: retryNode } = await managed.sessionManager.appendMessage({
  projectName: 'use-llms-live',
  path: 'conversation-tests',
  sessionId,
  parentId: header.id,
  branch: 'retry',
  message: buildUserMessage('Alternate branch'),
  api: managed.conversation.state.provider.model.api,
  modelId: managed.conversation.state.provider.model.id,
  providerOptions: managed.conversation.state.provider.providerOptions,
});

const sessions = await managed.sessionManager.listSessions('use-llms-live', 'conversation-tests');
assert.equal(sessions.length, 1);

const session = await managed.sessionManager.getSession(
  'use-llms-live',
  sessionId,
  'conversation-tests'
);
assert.ok(session);

const mainMessages = await managed.sessionManager.getMessages(
  'use-llms-live',
  sessionId,
  'main',
  'conversation-tests'
);
assert.ok(mainMessages);

const branches = await managed.sessionManager.getBranches(
  'use-llms-live',
  sessionId,
  'conversation-tests'
);
assert.ok(branches);

const retryBranch = branches.find((branch) => branch.name === 'retry');
assert.ok(retryBranch);
assert.equal(retryBranch.branchPointId, header.id);

const retryHistory = await managed.sessionManager.getBranchHistory(
  'use-llms-live',
  sessionId,
  'retry',
  'conversation-tests'
);
assert.ok(retryHistory);
assert.equal(retryHistory.length, 2);

const latestRetryNode = await managed.sessionManager.getLatestNode(
  'use-llms-live',
  sessionId,
  'retry',
  'conversation-tests'
);
assert.ok(latestRetryNode);
assert.equal(latestRetryNode.id, retryNode.id);

const rehydrated = createManagedConversation({
  modelId: 'gpt-5.4-mini',
});
rehydrated.replaceMessages(mainMessages.map((node) => node.message));
assert.equal(rehydrated.state.messages.length, mainMessages.length);

await rehydrated.prompt('Reply with exactly LIVE_FILE_SESSION_OK.');
assert.match(
  getAssistantText(rehydrated.state.messages[rehydrated.state.messages.length - 1]),
  /LIVE_FILE_SESSION_OK/i
);

console.log(JSON.stringify({
  answerText,
  eventTypes,
  sessionCount: sessions.length,
  sessionNodeCount: session.nodes.length,
  mainMessageCount: mainMessages.length,
  retryHistoryCount: retryHistory.length,
  branchNames: branches.map((branch) => branch.name).sort(),
  branchPointId: retryBranch.branchPointId,
  latestRetryNodeId: latestRetryNode.id,
  filePath: sessions[0].filePath,
  sessionsBaseDir,
  restoredMessageCount: rehydrated.state.messages.length,
}));
`);

    expect(report.answerText).toMatch(/10/);
    expect(report.eventTypes).toContain('tool_execution_start');
    expect(report.eventTypes).toContain('tool_execution_end');
    expect(report.sessionCount).toBe(1);
    expect(report.sessionNodeCount).toBeGreaterThan(report.mainMessageCount);
    expect(report.mainMessageCount).toBeGreaterThan(0);
    expect(report.retryHistoryCount).toBe(2);
    expect(report.branchNames).toEqual(['main', 'retry']);
    expect(report.branchPointId).toBeTruthy();
    expect(report.latestRetryNodeId).toBeTruthy();
    expect(report.filePath.startsWith(report.sessionsBaseDir)).toBe(true);
    expect(report.restoredMessageCount).toBeGreaterThan(report.mainMessageCount);
  }, 240_000);

  it('supports promptMessage() and in-memory sessions with the same live credentials path', async () => {
    const report = await runLiveScript<{
      text: string;
      projectNames: string[];
      sessionCount: number;
      nodeCount: number;
      branchNames: string[];
    }>(`
const managed = createManagedConversation({
  modelId: 'gpt-5.4-mini',
  systemPrompt: 'Return the exact token requested and nothing else.',
  thinkingLevel: 'low',
  sessions: 'memory',
});

const userMessage = buildUserMessage('Reply with exactly LIVE_MEMORY_OK.');
const newMessages = await managed.conversation.promptMessage(userMessage);
const lastMessage = newMessages[newMessages.length - 1];

assert.ok(lastMessage);
assert.equal(lastMessage.role, 'assistant');

const text = getAssistantText(lastMessage);
assert.match(text, /LIVE_MEMORY_OK/i);

const { sessionId, header } = await managed.sessionManager.createSession({
  projectName: 'use-llms-memory',
  sessionName: 'Memory Run',
});

let parentId = header.id;
for (const message of managed.conversation.state.messages) {
  const { node } = await managed.sessionManager.appendMessage({
    projectName: 'use-llms-memory',
    path: '',
    sessionId,
    parentId,
    branch: 'main',
    message,
    api: managed.conversation.state.provider.model.api,
    modelId: managed.conversation.state.provider.model.id,
    providerOptions: managed.conversation.state.provider.providerOptions,
  });

  parentId = node.id;
}

const projects = await managed.sessionManager.listProjects();
const sessions = await managed.sessionManager.listSessions('use-llms-memory');
const session = await managed.sessionManager.getSession('use-llms-memory', sessionId);
const branches = await managed.sessionManager.getBranches('use-llms-memory', sessionId);

assert.ok(session);
assert.ok(branches);

console.log(JSON.stringify({
  text,
  projectNames: projects.sort(),
  sessionCount: sessions.length,
  nodeCount: session.nodes.length,
  branchNames: branches.map((branch) => branch.name).sort(),
}));
`);

    expect(report.text).toMatch(/LIVE_MEMORY_OK/i);
    expect(report.projectNames).toEqual(['use-llms-memory']);
    expect(report.sessionCount).toBe(1);
    expect(report.nodeCount).toBeGreaterThan(1);
    expect(report.branchNames).toEqual(['main']);
  }, 180_000);
});
