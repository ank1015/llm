import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getModel } from '@ank1015/llm-core';
import { readSession } from '@ank1015/llm-sdk/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@ank1015/llm-core';
import type { AgentEvent, AgentResult, AgentRun, CuratedModelId, Message } from '@ank1015/llm-sdk';
import type { SessionNodeSaveContext } from '@ank1015/llm-sdk/session';

const mockCreateAllTools = vi.fn();
const mockCreateCheckpointSummaryPrompt = vi.fn();
const mockCreateSystemPrompt = vi.fn();
const mockGetRegisteredSkill = vi.fn();
const mockListRegisteredSkills = vi.fn();
const mockAgent = vi.fn();
const mockLlm = vi.fn();

vi.mock('@ank1015/llm-agents', () => ({
  createAllTools: mockCreateAllTools,
  createCheckpointSummaryPrompt: mockCreateCheckpointSummaryPrompt,
  createSystemPrompt: mockCreateSystemPrompt,
  getRegisteredSkill: mockGetRegisteredSkill,
  listRegisteredSkills: mockListRegisteredSkills,
}));

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();
  return {
    ...actual,
    agent: mockAgent,
    llm: mockLlm,
  };
});

const { setConfig } = await import('../../../src/core/config.js');
const { Project } = await import('../../../src/core/project/project.js');
const { ArtifactDir } = await import('../../../src/core/artifact-dir/artifact-dir.js');
const { Session } = await import('../../../src/core/session/session.js');

type MockAgentScenario = {
  events?: AgentEvent[];
  newMessages?: Message[];
  error?: {
    phase: 'session' | 'model' | 'tool' | 'limit' | 'hook' | 'aborted';
    message: string;
    canRetry: boolean;
  };
  onCall?: (input: Record<string, unknown>) => void;
};

const agentScenarios: MockAgentScenario[] = [];

const PROJECT_NAME = 'Test Project';
const PROJECT_ID = 'test-project';
const ARTIFACT_NAME = 'Research Docs';
const ARTIFACT_ID = 'research-docs';

let projectsRoot: string;
let dataRoot: string;

function queueAgentScenario(scenario: MockAgentScenario): void {
  agentScenarios.push(scenario);
}

function splitCuratedModelId(modelId: CuratedModelId): { api: Api; providerModelId: string } {
  const separator = modelId.indexOf('/');
  if (separator <= 0) {
    throw new Error(`Invalid curated modelId: ${modelId}`);
  }

  return {
    api: modelId.slice(0, separator) as Api,
    providerModelId: modelId.slice(separator + 1),
  };
}

function buildAssistantMessage(text: string, modelId: CuratedModelId): Message {
  const { api, providerModelId } = splitCuratedModelId(modelId);
  const model = getModel(api, providerModelId as never);
  if (!model) {
    throw new Error(`Model not found for ${modelId}`);
  }

  return {
    role: 'assistant',
    id: randomUUID(),
    api,
    model,
    message: {} as never,
    timestamp: Date.now(),
    duration: 1,
    stopReason: 'stop',
    content: [
      {
        type: 'response',
        response: [{ type: 'text', content: text }],
      },
    ],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };
}

function createMockAgentRun(
  sessionPath: string,
  resultPromise: Promise<AgentResult>,
  events: AgentEvent[]
): AgentRun {
  return {
    sessionPath,
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    drain: () => resultPromise,
    then: resultPromise.then.bind(resultPromise),
    catch: resultPromise.catch.bind(resultPromise),
    finally: resultPromise.finally.bind(resultPromise),
  };
}

async function persistMockMessage(
  context: {
    path: string;
    branch: string;
    saveNode?: ((context: SessionNodeSaveContext) => Promise<void> | void) | undefined;
  },
  message: Message,
  parentId: string
): Promise<string> {
  const session = await readSession(context.path);
  if (!session) {
    throw new Error(`Session missing at ${context.path}`);
  }

  const node = {
    type: 'message' as const,
    id: randomUUID(),
    parentId,
    branch: context.branch,
    timestamp: new Date().toISOString(),
    message,
  };

  if (context.saveNode) {
    await context.saveNode({
      path: context.path,
      session,
      node,
    });
  }

  return node.id;
}

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-data-'));
  setConfig({ projectsRoot, dataRoot });

  await Project.create({ name: PROJECT_NAME });
  await ArtifactDir.create(PROJECT_ID, { name: ARTIFACT_NAME });

  agentScenarios.length = 0;
  mockCreateAllTools.mockReset().mockReturnValue({});
  mockCreateCheckpointSummaryPrompt.mockReset().mockReturnValue('checkpoint summary prompt');
  mockCreateSystemPrompt.mockReset().mockResolvedValue('system prompt');
  mockLlm.mockReset();
  mockAgent.mockReset().mockImplementation((input: Record<string, unknown>) => {
    const scenario = agentScenarios.shift() ?? {};
    scenario.onCall?.(input);

    const resultPromise = (async (): Promise<AgentResult> => {
      const sessionInput = input.session as {
        path: string;
        branch: string;
        headId: string;
        saveNode?: (context: SessionNodeSaveContext) => Promise<void> | void;
      };
      const inputMessages = (input.inputMessages as Message[] | undefined) ?? [];
      const newMessages = scenario.newMessages ?? [];
      const storedSession = await readSession(sessionInput.path);
      if (!storedSession) {
        throw new Error(`Session missing at ${sessionInput.path}`);
      }

      let currentHeadId = sessionInput.headId ?? storedSession.header.id;
      for (const message of inputMessages) {
        currentHeadId = await persistMockMessage(
          {
            path: sessionInput.path,
            branch: sessionInput.branch,
            saveNode: sessionInput.saveNode,
          },
          message,
          currentHeadId
        );
      }

      for (const message of newMessages) {
        currentHeadId = await persistMockMessage(
          {
            path: sessionInput.path,
            branch: sessionInput.branch,
            saveNode: sessionInput.saveNode,
          },
          message,
          currentHeadId
        );
      }

      const sessionAfterPersist = await readSession(sessionInput.path);
      if (!sessionAfterPersist) {
        throw new Error(`Session missing at ${sessionInput.path}`);
      }

      if (scenario.error) {
        return {
          ok: false,
          sessionPath: sessionInput.path,
          sessionId: sessionAfterPersist.header.id,
          branch: sessionInput.branch,
          headId: currentHeadId,
          messages: [...inputMessages, ...newMessages],
          newMessages,
          error: scenario.error,
          turns: 1,
          totalTokens: 0,
          totalCost: 0,
        };
      }

      const finalAssistantMessage = [...newMessages]
        .reverse()
        .find((message): message is Extract<Message, { role: 'assistant' }> => {
          return message.role === 'assistant';
        });

      return {
        ok: true,
        sessionPath: sessionInput.path,
        sessionId: sessionAfterPersist.header.id,
        branch: sessionInput.branch,
        headId: currentHeadId,
        messages: [...inputMessages, ...newMessages],
        newMessages,
        ...(finalAssistantMessage ? { finalAssistantMessage } : {}),
        turns: 1,
        totalTokens: 0,
        totalCost: 0,
      };
    })();

    return createMockAgentRun(
      (input.session as { path: string }).path,
      resultPromise,
      scenario.events ?? []
    );
  });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

async function createSession(
  name = 'Test Session',
  modelId: CuratedModelId = 'openai/gpt-5.4-mini'
) {
  return Session.create(PROJECT_ID, ARTIFACT_ID, { name, modelId });
}

describe('Session', () => {
  it('creates, loads, lists, and deletes sessions from SDK session headers', async () => {
    const alpha = await createSession('Alpha', 'openai/gpt-5.4-mini');
    const alphaMetadata = await alpha.getMetadata();
    expect(alphaMetadata).toMatchObject({
      id: alpha.sessionId,
      name: 'Alpha',
      modelId: 'openai/gpt-5.4-mini',
      activeBranch: 'main',
    });

    const loaded = await Session.getById(PROJECT_ID, ARTIFACT_ID, alpha.sessionId);
    expect(loaded.modelId).toBe('openai/gpt-5.4-mini');

    const beta = await createSession('Beta', 'google/gemini-3.1-pro-preview');
    const listed = await Session.list(PROJECT_ID, ARTIFACT_ID);
    expect(listed).toHaveLength(2);
    expect(listed.map((entry) => entry.sessionId)).toEqual(
      expect.arrayContaining([alpha.sessionId, beta.sessionId])
    );

    await Session.delete(PROJECT_ID, ARTIFACT_ID, alpha.sessionId);
    await expect(Session.getById(PROJECT_ID, ARTIFACT_ID, alpha.sessionId)).rejects.toThrow(
      'not found'
    );
  });

  it('persists prompt turns with model override metadata and shared agent config', async () => {
    const overrideModelId = 'google/gemini-3.1-pro-preview' as const;
    const assistantMessage = buildAssistantMessage('Hello back', overrideModelId);

    queueAgentScenario({
      newMessages: [assistantMessage],
      onCall: (input) => {
        expect(input.modelId).toBe(overrideModelId);
        expect(input.reasoningEffort).toBe('medium');
        expect(input.system).toBe('system prompt');
        expect(Array.isArray(input.tools)).toBe(true);
        expect(typeof (input.session as { loadMessages?: unknown }).loadMessages).toBe('function');
      },
    });

    const session = await createSession('Override Test', 'openai/gpt-5.4-mini');
    const messages = await session.prompt({
      message: 'Hello',
      modelId: overrideModelId,
      reasoningEffort: 'medium',
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[1]).toEqual(assistantMessage);

    const historyNodes = await session.getHistoryNodes();
    expect(historyNodes).toHaveLength(2);
    expect(historyNodes[0]?.metadata?.modelId).toBe(overrideModelId);
    expect(historyNodes[1]?.metadata?.modelId).toBe(overrideModelId);

    expect(mockCreateAllTools).toHaveBeenCalledWith(join(projectsRoot, PROJECT_ID, ARTIFACT_ID));
    expect(mockCreateSystemPrompt).toHaveBeenCalledWith({
      projectName: PROJECT_NAME,
      projectDir: join(projectsRoot, PROJECT_ID),
      artifactName: ARTIFACT_NAME,
      artifactDir: join(projectsRoot, PROJECT_ID, ARTIFACT_ID),
    });
  });

  it('streams agent events and node persistence callbacks', async () => {
    const assistantMessage = buildAssistantMessage('Streaming reply', 'openai/gpt-5.4-mini');
    const events: AgentEvent[] = [
      { type: 'agent_start' },
      { type: 'agent_end', agentMessages: [assistantMessage] },
    ];

    queueAgentScenario({
      events,
      newMessages: [assistantMessage],
      onCall: (input) => {
        expect(typeof (input.session as { loadMessages?: unknown }).loadMessages).toBe('function');
      },
    });

    const session = await createSession();
    const observedEvents: AgentEvent[] = [];
    const persistedNodes: Awaited<ReturnType<typeof session.getHistoryNodes>> = [];

    const messages = await session.streamPrompt(
      { message: 'Stream this' },
      {
        onEvent: (event) => observedEvents.push(event),
        onNodePersisted: (node) => persistedNodes.push(node),
      }
    );

    expect(messages).toHaveLength(2);
    expect(observedEvents).toEqual(events);
    expect(persistedNodes).toHaveLength(2);
    expect(persistedNodes[0]?.message.role).toBe('user');
    expect(persistedNodes[1]?.message.role).toBe('assistant');
  });

  it('creates retry branches and switches the active path back with leafNodeId', async () => {
    const session = await createSession();

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Main answer', 'openai/gpt-5.4-mini')],
    });
    await session.prompt({ message: 'Main question' });

    const mainTree = await session.getMessageTree();
    const mainUserNode = mainTree.nodes.find((node) => node.message.role === 'user');
    const mainAssistantNode = mainTree.nodes.find((node) => node.message.role === 'assistant');
    expect(mainUserNode).toBeDefined();
    expect(mainAssistantNode).toBeDefined();

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Retry answer', 'openai/gpt-5.4-mini')],
    });
    await session.streamRetryFromUserMessage(mainUserNode!.id, {}, { onEvent: () => undefined });

    const retryMetadata = await session.getMetadata();
    expect(retryMetadata.activeBranch).not.toBe('main');

    const retryTree = await session.getMessageTree();
    expect(retryTree.nodes.some((node) => node.branch.startsWith('retry-'))).toBe(true);
    expect(retryTree.persistedLeafNodeId).not.toBe(mainAssistantNode!.id);

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Back on main', 'openai/gpt-5.4-mini')],
    });
    await session.prompt({
      message: 'Continue on main',
      leafNodeId: mainAssistantNode!.id,
    });

    const metadataAfterMain = await session.getMetadata();
    expect(metadataAfterMain.activeBranch).toBe('main');
    const mainHistory = await session.getHistoryNodes();
    expect(mainHistory).toHaveLength(4);
  });

  it('creates edit branches with rewritten visible user text', async () => {
    const session = await createSession();

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Initial answer', 'openai/gpt-5.4-mini')],
    });
    await session.prompt({ message: 'Original prompt' });

    const tree = await session.getMessageTree();
    const originalUserNode = tree.nodes.find((node) => node.message.role === 'user');
    expect(originalUserNode).toBeDefined();

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Edited answer', 'openai/gpt-5.4-mini')],
    });
    const editedMessages = await session.streamEditFromUserMessage(
      originalUserNode!.id,
      { message: 'Edited prompt', reasoningEffort: 'low' },
      { onEvent: () => undefined }
    );

    const editedUserMessage = editedMessages[0];
    expect(editedUserMessage?.role).toBe('user');
    expect(
      editedUserMessage?.role === 'user'
        ? editedUserMessage.content.find(
            (block) => block.type === 'text' && !block.metadata?.hiddenFromUI
          )?.content
        : undefined
    ).toBe('Edited prompt');

    const metadata = await session.getMetadata();
    expect(metadata.activeBranch).not.toBe('main');
  });

  it('generates names with llm output and falls back when llm fails', async () => {
    const namedSession = await createSession();
    mockLlm.mockResolvedValueOnce(
      buildAssistantMessage('Research Plan', 'google/gemini-3-flash-preview')
    );

    const generatedName = await namedSession.generateName('How should we plan this migration?');
    expect(generatedName).toBe('Research Plan');
    expect((await namedSession.getMetadata()).name).toBe('Research Plan');

    const fallbackSession = await createSession();
    mockLlm.mockRejectedValueOnce(new Error('naming failed'));

    const fallbackName = await fallbackSession.generateName('Fallback name should use this prompt');
    expect(fallbackName).toBe('Fallback name should use this prompt');
    expect((await fallbackSession.getMetadata()).name).toBe(fallbackName);
  });
});
