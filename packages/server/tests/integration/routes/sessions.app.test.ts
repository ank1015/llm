import { randomUUID } from 'node:crypto';

import { getModel } from '@ank1015/llm-core';
import { readSession } from '@ank1015/llm-sdk/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../../src/app.js';
import { resetSessionRunRegistry } from '../../../src/core/session/run-registry.js';
import { createTempServerConfig, jsonRequest, readSseEvents } from '../../helpers/server-fixture.js';

import type { Api } from '@ank1015/llm-core';
import type { AgentResult, AgentRun, CuratedModelId, Message } from '@ank1015/llm-sdk';
import type { SessionNodeSaveContext } from '@ank1015/llm-sdk/session';

const {
  mockCreateAllTools,
  mockCreateCheckpointSummaryPrompt,
  mockCreateSystemPrompt,
  mockAgent,
  mockLlm,
} = vi.hoisted(() => ({
  mockCreateAllTools: vi.fn(),
  mockCreateCheckpointSummaryPrompt: vi.fn(),
  mockCreateSystemPrompt: vi.fn(),
  mockAgent: vi.fn(),
  mockLlm: vi.fn(),
}));

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

const { Project } = await import('../../../src/core/project/project.js');
const { ArtifactDir } = await import('../../../src/core/artifact-dir/artifact-dir.js');
const { Session } = await import('../../../src/core/session/session.js');

type MockAgentScenario = {
  newMessages?: Message[];
};

const agentScenarios: MockAgentScenario[] = [];

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

function createMockAgentRun(sessionPath: string, resultPromise: Promise<AgentResult>): AgentRun {
  return {
    sessionPath,
    async *[Symbol.asyncIterator]() {
      await resultPromise;
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

let cleanup: (() => Promise<void>) | null = null;
let app = createApp();

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-session-app');
  cleanup = fixture.cleanup;

  await Project.create({ name: 'Route Project' });
  await ArtifactDir.create('route-project', { name: 'Route Artifact' });

  resetSessionRunRegistry();
  agentScenarios.length = 0;
  mockCreateAllTools.mockReset().mockReturnValue({});
  mockCreateCheckpointSummaryPrompt.mockReset().mockReturnValue('checkpoint summary prompt');
  mockCreateSystemPrompt.mockReset().mockResolvedValue('system prompt');
  mockLlm.mockReset();
  mockAgent.mockReset().mockImplementation((input: Record<string, unknown>) => {
    const scenario = agentScenarios.shift() ?? {};

    const resultPromise = (async (): Promise<AgentResult> => {
      const sessionInput = input.session as {
        path: string;
        branch: string;
        headId: string;
        saveNode?: (context: SessionNodeSaveContext) => Promise<void> | void;
      };
      const inputMessages = (input.inputMessages as Message[] | undefined) ?? [];
      const newMessages = scenario.newMessages ?? [];
      const session = await readSession(sessionInput.path);
      if (!session) {
        throw new Error(`Session missing at ${sessionInput.path}`);
      }

      let currentHeadId = sessionInput.headId ?? session.header.id;
      for (const message of [...inputMessages, ...newMessages]) {
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

      const finalAssistantMessage = [...newMessages]
        .reverse()
        .find((message): message is Extract<Message, { role: 'assistant' }> => {
          return message.role === 'assistant';
        });

      return {
        ok: true,
        sessionPath: sessionInput.path,
        sessionId: session.header.id,
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

    return createMockAgentRun((input.session as { path: string }).path, resultPromise);
  });

  app = createApp();
});

afterEach(async () => {
  resetSessionRunRegistry();
  await cleanup?.();
  cleanup = null;
});

describe('mounted app session routes', () => {
  it('creates a session, prompts it, and returns persisted history through /api', async () => {
    const createResponse = await jsonRequest(
      app,
      '/api/projects/route-project/artifacts/route-artifact/sessions',
      'POST',
      {
        name: 'Mounted Session',
        modelId: 'codex/gpt-5.4-mini',
      }
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string; name: string };
    expect(created.name).toBe('Mounted Session');

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Mounted route reply', 'codex/gpt-5.4-mini')],
    });

    const promptResponse = await jsonRequest(
      app,
      `/api/projects/route-project/artifacts/route-artifact/sessions/${created.id}/prompt`,
      'POST',
      { message: 'Reply with mounted prompt ok' }
    );
    expect(promptResponse.status).toBe(200);
    const promptedMessages = (await promptResponse.json()) as Message[];
    expect(promptedMessages).toHaveLength(2);

    const messagesResponse = await app.request(
      `/api/projects/route-project/artifacts/route-artifact/sessions/${created.id}/messages`
    );
    expect(messagesResponse.status).toBe(200);
    expect(await messagesResponse.json()).toEqual([
      expect.objectContaining({
        type: 'message',
        metadata: expect.objectContaining({ modelId: 'codex/gpt-5.4-mini' }),
      }),
      expect.objectContaining({
        type: 'message',
        metadata: expect.objectContaining({ modelId: 'codex/gpt-5.4-mini' }),
      }),
    ]);
  });

  it('streams SSE events and supports mounted generate-name updates', async () => {
    const session = await Session.create('route-project', 'route-artifact', {
      name: 'Before Naming',
      modelId: 'codex/gpt-5.4-mini',
    });

    queueAgentScenario({
      newMessages: [buildAssistantMessage('Mounted stream reply', 'codex/gpt-5.4-mini')],
    });

    const streamResponse = await jsonRequest(
      app,
      `/api/projects/route-project/artifacts/route-artifact/sessions/${session.sessionId}/stream`,
      'POST',
      { message: 'Reply with mounted stream ok' }
    );
    expect(streamResponse.status).toBe(200);

    const sseEvents = await readSseEvents(streamResponse);
    expect(sseEvents.map((event) => event.event)).toEqual(
      expect.arrayContaining(['ready', 'node_persisted', 'done'])
    );

    mockLlm.mockResolvedValue(buildAssistantMessage('Mounted Generated Name', 'codex/gpt-5.4-mini'));

    const renameResponse = await jsonRequest(
      app,
      `/api/projects/route-project/artifacts/route-artifact/sessions/${session.sessionId}/generate-name`,
      'POST',
      { query: 'build a mounted generate name test' }
    );
    expect(renameResponse.status).toBe(200);
    expect(await renameResponse.json()).toEqual({
      ok: true,
      sessionId: session.sessionId,
      sessionName: 'Mounted Generated Name',
    });

    await expect(session.getMetadata()).resolves.toMatchObject({
      name: 'Mounted Generated Name',
    });
  });
});
