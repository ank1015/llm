import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getModel } from '@ank1015/llm-core';
import { readSession } from '@ank1015/llm-sdk/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@ank1015/llm-core';
import type {
  AgentEvent,
  AgentResult,
  AgentRun,
  CuratedModelId,
  Message,
} from '@ank1015/llm-sdk';
import type { SessionNodeSaveContext } from '@ank1015/llm-sdk/session';

const mockCreateAllTools = vi.fn();
const mockCreateCheckpointSummaryPrompt = vi.fn();
const mockCreateSystemPrompt = vi.fn();
const mockAgent = vi.fn();
const mockLlm = vi.fn();

vi.mock('@ank1015/llm-agents', () => ({
  createAllTools: mockCreateAllTools,
  createCheckpointSummaryPrompt: mockCreateCheckpointSummaryPrompt,
  createSystemPrompt: mockCreateSystemPrompt,
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
const { resetSessionRunRegistry, sessionRunRegistry } = await import(
  '../../../src/core/session/run-registry.js'
);
const { sessionRoutes } = await import('../../../src/routes/sessions.js');

type MockAgentScenario = {
  events?: AgentEvent[];
  newMessages?: Message[];
  blockUntil?: Promise<void>;
  error?: {
    phase: 'session' | 'model' | 'tool' | 'limit' | 'hook' | 'aborted';
    message: string;
    canRetry: boolean;
  };
  onCall?: (input: Record<string, unknown>) => void;
};

const agentScenarios: MockAgentScenario[] = [];

const PROJECT_NAME = 'Route Project';
const PROJECT_ID = 'route-project';
const ARTIFACT_NAME = 'Route Artifact';
const ARTIFACT_ID = 'route-artifact';

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
  events: AgentEvent[],
  blockUntil?: Promise<void>
): AgentRun {
  return {
    sessionPath,
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }

      if (blockUntil) {
        await blockUntil;
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

function jsonRequest(path: string, method: string, body?: unknown): Promise<Response> {
  return sessionRoutes.request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function readFirstStreamChunk(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Expected response body stream');
  }

  const { value } = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(value ?? new Uint8Array());
}

function getVisibleUserText(message: Message): string | undefined {
  if (message.role !== 'user') {
    return undefined;
  }

  return message.content.find((block) => block.type === 'text' && !block.metadata?.hiddenFromUI)
    ?.content;
}

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-route-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-route-data-'));
  setConfig({ projectsRoot, dataRoot });

  await Project.create({ name: PROJECT_NAME });
  await ArtifactDir.create(PROJECT_ID, { name: ARTIFACT_NAME });

  resetSessionRunRegistry();
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

      if (scenario.blockUntil) {
        await scenario.blockUntil;
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
      scenario.events ?? [],
      scenario.blockUntil
    );
  });
});

afterEach(async () => {
  resetSessionRunRegistry();
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('session routes', () => {
  it('creates sessions and prompts with current-native contracts and SDK-native nodes', async () => {
    const createResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions`,
      'POST',
      {
        name: 'HTTP Session',
        modelId: 'openai/gpt-5.4-mini',
      }
    );

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      id: string;
      name: string;
      modelId: string;
      createdAt: string;
      activeBranch: string;
    };
    expect(created).toMatchObject({
      name: 'HTTP Session',
      modelId: 'openai/gpt-5.4-mini',
      activeBranch: 'main',
    });
    expect('api' in created).toBe(false);

    const overrideModelId = 'google/gemini-3.1-pro-preview' as const;
    queueAgentScenario({
      newMessages: [buildAssistantMessage('HTTP reply', overrideModelId)],
      onCall: (input) => {
        expect(input.modelId).toBe(overrideModelId);
        expect(input.reasoningEffort).toBe('medium');
      },
    });

    const promptResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${created.id}/prompt`,
      'POST',
      {
        message: 'Use the override model',
        modelId: overrideModelId,
        reasoningEffort: 'medium',
      }
    );

    expect(promptResponse.status).toBe(200);
    const promptedMessages = (await promptResponse.json()) as Message[];
    expect(promptedMessages).toHaveLength(2);
    expect(promptedMessages[0]?.role).toBe('user');
    expect(promptedMessages[1]?.role).toBe('assistant');

    const messagesResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${created.id}/messages`,
      'GET'
    );
    const messageNodes = (await messagesResponse.json()) as Array<Record<string, unknown>>;
    expect(messageNodes).toHaveLength(2);
    expect(messageNodes[0]?.['type']).toBe('message');
    expect(messageNodes[0]?.['metadata']).toMatchObject({ modelId: overrideModelId });
    expect('api' in messageNodes[0]!).toBe(false);

    const treeResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${created.id}/tree`,
      'GET'
    );
    const tree = (await treeResponse.json()) as {
      nodes: Array<Record<string, unknown>>;
      persistedLeafNodeId: string | null;
      activeBranch: string;
    };
    expect(tree.activeBranch).toBe('main');
    expect(tree.nodes).toHaveLength(2);
    expect(tree.persistedLeafNodeId).toBe(messageNodes[1]?.['id']);
  });

  it('persists prompt attachments and generates names with llm fallback support', async () => {
    const session = await Session.create(PROJECT_ID, ARTIFACT_ID, {
      name: 'Attachment Session',
      modelId: 'codex/gpt-5.4-mini',
    });

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Attachment reply', 'codex/gpt-5.4-mini')],
    });

    const attachmentResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/prompt`,
      'POST',
      {
        message: 'Process the attachment',
        attachments: [
          {
            id: 'attachment-1',
            type: 'file',
            fileName: 'report.txt',
            mimeType: 'text/plain',
            content: Buffer.from('attachment body', 'utf8').toString('base64'),
          },
        ],
      }
    );
    expect(attachmentResponse.status).toBe(200);

    const nodes = await session.getHistoryNodes();
    const userNode = nodes.find((node) => node.message.role === 'user');
    expect(userNode).toBeDefined();
    expect(userNode?.message.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          metadata: expect.objectContaining({
            hiddenFromUI: true,
            kind: 'saved-attachment-path',
          }),
        }),
        expect.objectContaining({
          type: 'file',
          filename: 'report.txt',
          metadata: expect.objectContaining({
            originalFileName: 'report.txt',
            artifactRelativePath: expect.stringContaining('.max/user-artifacts/'),
          }),
        }),
      ])
    );

    mockLlm.mockResolvedValue(buildAssistantMessage('"Generated Session Name"', 'codex/gpt-5.4-mini'));

    const generatedResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/generate-name`,
      'POST',
      {
        query: 'Plan the server session coverage',
      }
    );
    expect(generatedResponse.status).toBe(200);
    expect(await generatedResponse.json()).toEqual({
      ok: true,
      sessionId: session.sessionId,
      sessionName: 'Generated Session Name',
    });

    mockLlm.mockRejectedValueOnce(new Error('naming failed'));

    const fallbackResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/generate-name`,
      'POST',
      {
        query: 'Fallback session name for llm failure handling',
      }
    );
    expect(fallbackResponse.status).toBe(200);
    expect(await fallbackResponse.json()).toEqual({
      ok: true,
      sessionId: session.sessionId,
      sessionName: 'Fallback session name for llm failure handling',
    });
  });

  it('supports stream attach and cancel for active runs', async () => {
    const session = await Session.create(PROJECT_ID, ARTIFACT_ID, {
      name: 'Streaming Session',
      modelId: 'openai/gpt-5.4-mini',
    });

    const deferred = new Promise<void>(() => undefined);
    queueAgentScenario({
      blockUntil: deferred,
    });

    const streamResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/stream`,
      'POST',
      { message: 'Keep this run alive' }
    );
    expect(streamResponse.status).toBe(200);
    const readyChunk = await readFirstStreamChunk(streamResponse);
    expect(readyChunk).toContain('event: ready');

    const sessionKey = `${PROJECT_ID}:${ARTIFACT_ID}:${session.sessionId}`;
    const liveRun = sessionRunRegistry.getLiveRunSummary(sessionKey);
    expect(liveRun?.status).toBe('running');

    const attachResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/runs/${liveRun!.runId}/stream`,
      'GET'
    );
    expect(attachResponse.status).toBe(200);
    const attachChunk = await readFirstStreamChunk(attachResponse);
    expect(attachChunk).toContain(liveRun!.runId);

    const cancelResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/runs/${liveRun!.runId}/cancel`,
      'POST'
    );
    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toEqual({
      ok: true,
      sessionId: session.sessionId,
      runId: liveRun!.runId,
      cancelled: true,
    });
  });

  it('creates retry and edit branches through the streaming endpoints', async () => {
    const retrySession = await Session.create(PROJECT_ID, ARTIFACT_ID, {
      name: 'Branch Session',
      modelId: 'openai/gpt-5.4-mini',
    });

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Initial answer', 'openai/gpt-5.4-mini')],
    });
    await retrySession.prompt({ message: 'Original prompt' });

    const initialTree = await retrySession.getMessageTree();
    const originalUserNode = initialTree.nodes.find((node) => node.message.role === 'user');
    expect(originalUserNode).toBeDefined();

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Retry answer', 'openai/gpt-5.4-mini')],
    });
    const retryResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${retrySession.sessionId}/messages/${originalUserNode!.id}/retry/stream`,
      'POST',
      { reasoningEffort: 'low' }
    );
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.text()).toContain('event: done');

    const afterRetry = await retrySession.getMessageTree();
    expect(afterRetry.nodes.some((node) => node.branch.startsWith('retry-'))).toBe(true);

    const editSession = await Session.create(PROJECT_ID, ARTIFACT_ID, {
      name: 'Edit Session',
      modelId: 'openai/gpt-5.4-mini',
    });

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Editable answer', 'openai/gpt-5.4-mini')],
    });
    await editSession.prompt({ message: 'Editable prompt' });

    const editableTree = await editSession.getMessageTree();
    const editableUserNode = editableTree.nodes.find((node) => node.message.role === 'user');
    expect(editableUserNode).toBeDefined();

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Edited answer', 'openai/gpt-5.4-mini')],
    });
    const editResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${editSession.sessionId}/messages/${editableUserNode!.id}/edit/stream`,
      'POST',
      { message: 'Edited prompt' }
    );
    expect(editResponse.status).toBe(200);
    expect(await editResponse.text()).toContain('event: done');

    const afterEdit = await editSession.getMessageTree();
    const editedUserNode = afterEdit.nodes.find(
      (node) => node.branch.startsWith('edit-') && node.message.role === 'user'
    );
    expect(editedUserNode).toBeDefined();
    expect(getVisibleUserText(editedUserNode!.message)).toBe('Edited prompt');
  });

  it('edits a message from a non-active path when leafNodeId selects the visible lineage', async () => {
    const session = await Session.create(PROJECT_ID, ARTIFACT_ID, {
      name: 'Leaf Path Session',
      modelId: 'openai/gpt-5.4-mini',
    });

    queueAgentScenario({
      newMessages: [buildAssistantMessage('First main answer', 'openai/gpt-5.4-mini')],
    });
    await session.prompt({ message: 'First main prompt' });

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Second main answer', 'openai/gpt-5.4-mini')],
    });
    await session.prompt({ message: 'Second main prompt' });

    const mainTree = await session.getMessageTree();
    const firstUserNode = mainTree.nodes.find(
      (node) => node.message.role === 'user' && getVisibleUserText(node.message) === 'First main prompt'
    );
    const secondUserNode = mainTree.nodes.find(
      (node) => node.message.role === 'user' && getVisibleUserText(node.message) === 'Second main prompt'
    );
    const mainLeafNodeId = mainTree.persistedLeafNodeId;
    expect(firstUserNode).toBeDefined();
    expect(secondUserNode).toBeDefined();
    expect(mainLeafNodeId).toBeTruthy();
    if (!mainLeafNodeId) {
      throw new Error('Expected a visible main-branch leaf node');
    }

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Retry branch answer', 'openai/gpt-5.4-mini')],
    });
    const retryResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/messages/${firstUserNode!.id}/retry/stream`,
      'POST',
      { reasoningEffort: 'low' }
    );
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.text()).toContain('event: done');

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Edited from main path', 'openai/gpt-5.4-mini')],
    });
    const editResponse = await jsonRequest(
      `/projects/${PROJECT_ID}/artifacts/${ARTIFACT_ID}/sessions/${session.sessionId}/messages/${secondUserNode!.id}/edit/stream`,
      'POST',
      {
        message: 'Second main prompt edited',
        leafNodeId: mainLeafNodeId,
        reasoningEffort: 'low',
      }
    );
    expect(editResponse.status).toBe(200);
    expect(await editResponse.text()).toContain('event: done');

    const treeAfterEdit = await session.getMessageTree();
    const editedUserNode = treeAfterEdit.nodes.find(
      (node) =>
        node.branch.startsWith('edit-') &&
        node.message.role === 'user' &&
        getVisibleUserText(node.message) === 'Second main prompt edited'
    );
    expect(editedUserNode).toBeDefined();
  });
});
