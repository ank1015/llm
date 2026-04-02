import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getModel } from '@ank1015/llm-core';
import { readSession } from '@ank1015/llm-sdk/session';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@ank1015/llm-core';
import type { AgentResult, AgentRun, CuratedModelId, Message } from '@ank1015/llm-sdk';
import type { SessionNodeSaveContext } from '@ank1015/llm-sdk/session';

const mockCreateAllTools = vi.fn();
const mockCreateCheckpointSummaryPrompt = vi.fn();
const mockCreateSystemPrompt = vi.fn();
const mockGetRegisteredSkill = vi.fn();
const mockListRegisteredSkills = vi.fn();
const mockAgent = vi.fn();

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
  };
});

const { setConfig } = await import('../../../src/core/config.js');
const { Project } = await import('../../../src/core/project/project.js');
const { ArtifactDir } = await import('../../../src/core/artifact-dir/artifact-dir.js');
const { Session } = await import('../../../src/core/session/session.js');

const PROJECT_NAME = 'Integration Project';
const PROJECT_ID = 'integration-project';
const ARTIFACT_NAME = 'Research';
const ARTIFACT_ID = 'research';

let projectsRoot: string;
let dataRoot: string;

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

function createMockRun(sessionPath: string, resultPromise: Promise<AgentResult>): AgentRun {
  return {
    sessionPath,
    async *[Symbol.asyncIterator]() {
      await resultPromise;
      yield* [];
    },
    drain: () => resultPromise,
    then: resultPromise.then.bind(resultPromise),
    catch: resultPromise.catch.bind(resultPromise),
    finally: resultPromise.finally.bind(resultPromise),
  };
}

beforeEach(async () => {
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-integration-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-integration-data-'));
  setConfig({ projectsRoot, dataRoot });

  await Project.create({ name: PROJECT_NAME });
  await ArtifactDir.create(PROJECT_ID, { name: ARTIFACT_NAME });

  mockCreateAllTools.mockReset().mockReturnValue({});
  mockCreateCheckpointSummaryPrompt.mockReset().mockReturnValue('checkpoint summary prompt');
  mockCreateSystemPrompt.mockReset().mockResolvedValue('system prompt');
  mockAgent.mockReset().mockImplementation((input: Record<string, unknown>) => {
    const resultPromise = (async (): Promise<AgentResult> => {
      const sessionInput = input.session as {
        path: string;
        branch: string;
        headId: string;
        saveNode?: (context: SessionNodeSaveContext) => Promise<void> | void;
      };
      const inputMessages = (input.inputMessages as Message[] | undefined) ?? [];
      const assistantMessage = buildAssistantMessage('Integration reply', 'openai/gpt-5.4-mini');
      const session = await readSession(sessionInput.path);
      if (!session) {
        throw new Error(`Session missing at ${sessionInput.path}`);
      }

      let parentId = sessionInput.headId ?? session.header.id;
      for (const message of [...inputMessages, assistantMessage]) {
        const node = {
          type: 'message' as const,
          id: randomUUID(),
          parentId,
          branch: sessionInput.branch,
          timestamp: new Date().toISOString(),
          message,
        };

        if (sessionInput.saveNode) {
          await sessionInput.saveNode({
            path: sessionInput.path,
            session,
            node,
          });
        }
        parentId = node.id;
      }

      return {
        ok: true,
        sessionPath: sessionInput.path,
        sessionId: session.header.id,
        branch: sessionInput.branch,
        headId: parentId,
        messages: [...inputMessages, assistantMessage],
        newMessages: [assistantMessage],
        finalAssistantMessage: assistantMessage as Extract<Message, { role: 'assistant' }>,
        turns: 1,
        totalTokens: 0,
        totalCost: 0,
      };
    })();

    return createMockRun((input.session as { path: string }).path, resultPromise);
  });
});

afterEach(async () => {
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

describe('Session integration smoke', () => {
  it('creates a session and persists a prompt turn end-to-end', async () => {
    const session = await Session.create(PROJECT_ID, ARTIFACT_ID, {
      name: 'Integration Session',
      modelId: 'openai/gpt-5.4-mini',
    });

    const messages = await session.prompt({ message: 'Run the integration smoke test' });
    expect(messages).toHaveLength(2);

    const metadata = await session.getMetadata();
    expect(metadata).toMatchObject({
      id: session.sessionId,
      name: 'Integration Session',
      modelId: 'openai/gpt-5.4-mini',
      activeBranch: 'main',
    });

    const historyNodes = await session.getHistoryNodes();
    expect(historyNodes).toHaveLength(2);
    expect(historyNodes[0]?.message.role).toBe('user');
    expect(historyNodes[1]?.message.role).toBe('assistant');
    expect(historyNodes[0]?.metadata?.modelId).toBe('openai/gpt-5.4-mini');
    expect(historyNodes[1]?.metadata?.modelId).toBe('openai/gpt-5.4-mini');
  });
});
