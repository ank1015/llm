import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getModel } from '@ank1015/llm-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api, BaseAssistantMessage, Message } from '@ank1015/llm-sdk';

const mockLlm = vi.fn();
const mockCreateTurnCompactionPrompt = vi.fn(() => 'turn compaction prompt');

vi.mock('@ank1015/llm-agents', () => ({
  createTurnCompactionPrompt: mockCreateTurnCompactionPrompt,
}));

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();
  return {
    ...actual,
    llm: mockLlm,
  };
});

const { persistCompletedTurnCompaction } =
  await import('../../../../src/core/session/compaction.js');
const { getSessionCompactionNodes } =
  await import('../../../../src/core/session/compaction-storage.js');
const { getConfig, setConfig } = await import('../../../../src/core/config.js');

const PROJECT_ID = 'compaction-project';
const ARTIFACT_ID = 'compaction-artifact';
const SESSION_ID = 'session-123';
const LARGE_TOOL_TRACE_TEXT = 'x'.repeat(2600);

let projectsRoot = '';
let dataRoot = '';
let previousConfig = getConfig();

beforeEach(async () => {
  previousConfig = getConfig();
  projectsRoot = await mkdtemp(join(tmpdir(), 'llm-server-compaction-projects-'));
  dataRoot = await mkdtemp(join(tmpdir(), 'llm-server-compaction-data-'));
  setConfig({ projectsRoot, dataRoot });
  mockLlm.mockReset();
  mockCreateTurnCompactionPrompt.mockClear();
});

afterEach(async () => {
  setConfig(previousConfig);
  await rm(projectsRoot, { recursive: true, force: true });
  await rm(dataRoot, { recursive: true, force: true });
});

function splitCuratedModelId(modelId: string): { api: Api; providerModelId: string } {
  const separator = modelId.indexOf('/');
  if (separator <= 0) {
    throw new Error(`Invalid curated modelId: ${modelId}`);
  }

  return {
    api: modelId.slice(0, separator) as Api,
    providerModelId: modelId.slice(separator + 1),
  };
}

function buildAssistantMessage(input: {
  modelId: string;
  responseText?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; toolCallId: string }>;
}): BaseAssistantMessage<Api> {
  const { api, providerModelId } = splitCuratedModelId(input.modelId);
  const model = getModel(api, providerModelId as never);
  if (!model) {
    throw new Error(`Model not found for ${input.modelId}`);
  }

  const content: BaseAssistantMessage<Api>['content'] = [];
  if (input.responseText) {
    content.push({
      type: 'response',
      response: [{ type: 'text', content: input.responseText }],
    });
  }
  for (const toolCall of input.toolCalls ?? []) {
    content.push({
      type: 'toolCall',
      name: toolCall.name,
      arguments: toolCall.arguments,
      toolCallId: toolCall.toolCallId,
    });
  }

  return {
    role: 'assistant',
    id: `assistant-${Math.random().toString(36).slice(2)}`,
    api,
    model,
    message: {} as never,
    timestamp: Date.now(),
    duration: 1,
    stopReason: input.toolCalls?.length ? 'toolUse' : 'stop',
    content,
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

describe('persistCompletedTurnCompaction', () => {
  it('compacts a completed turn and stores a turn_compact sidecar node', async () => {
    mockLlm.mockResolvedValue(
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Inspected src/app.ts, updated the logic, and ran the tests.',
      })
    );

    const toolCallingAssistant = buildAssistantMessage({
      modelId: 'codex/gpt-5.4',
      toolCalls: [
        {
          name: 'read',
          arguments: { path: '/tmp/project/src/app.ts' },
          toolCallId: 'call-1',
        },
      ],
    });
    const finalAssistant = buildAssistantMessage({
      modelId: 'codex/gpt-5.4',
      responseText: 'Updated the logic and everything passes now.',
    });
    const turnMessages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Fix the app logic and verify it.' }],
      },
      toolCallingAssistant,
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: LARGE_TOOL_TRACE_TEXT }],
        isError: false,
        timestamp: Date.now(),
      },
      finalAssistant,
    ];

    const node = await persistCompletedTurnCompaction({
      projectId: PROJECT_ID,
      artifactDirId: ARTIFACT_ID,
      sessionId: SESSION_ID,
      branchName: 'main',
      turnMessages,
    });

    expect(node).toMatchObject({
      type: 'turn_compact',
      branchName: 'main',
      firstNodeId: toolCallingAssistant.id,
      lastNodeId: 'tool-1',
      compactionSummary: 'Inspected src/app.ts, updated the logic, and ran the tests.',
    });

    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual([
      node,
    ]);
  });

  it('uses the last tool result as lastNodeId when no final assistant reply exists', async () => {
    mockLlm.mockResolvedValue(
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Ran the command, hit an error, and the turn ended before a final reply.',
      })
    );

    const toolCallingAssistant = buildAssistantMessage({
      modelId: 'codex/gpt-5.4',
      toolCalls: [
        {
          name: 'bash',
          arguments: { command: 'pnpm build' },
          toolCallId: 'call-1',
        },
      ],
    });
    const terminalToolResult: Message = {
      role: 'toolResult',
      id: 'tool-1',
      toolName: 'bash',
      toolCallId: 'call-1',
      content: [{ type: 'text', content: LARGE_TOOL_TRACE_TEXT }],
      isError: true,
      error: { message: 'Command terminated early' },
      timestamp: Date.now(),
    };

    const node = await persistCompletedTurnCompaction({
      projectId: PROJECT_ID,
      artifactDirId: ARTIFACT_ID,
      sessionId: SESSION_ID,
      branchName: 'main',
      turnMessages: [
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Run the build.' }],
        },
        toolCallingAssistant,
        terminalToolResult,
      ],
    });

    expect(node).toMatchObject({
      firstNodeId: toolCallingAssistant.id,
      lastNodeId: terminalToolResult.id,
      type: 'turn_compact',
    });
  });

  it('returns null when the turn has no assistant messages to compact', async () => {
    await expect(
      persistCompletedTurnCompaction({
        projectId: PROJECT_ID,
        artifactDirId: ARTIFACT_ID,
        sessionId: SESSION_ID,
        branchName: 'main',
        turnMessages: [
          {
            role: 'user',
            id: 'user-1',
            content: [{ type: 'text', content: 'Hello' }],
          },
        ],
      })
    ).resolves.toBeNull();

    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual(
      []
    );
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it('returns null when the turn has no tool calls', async () => {
    await expect(
      persistCompletedTurnCompaction({
        projectId: PROJECT_ID,
        artifactDirId: ARTIFACT_ID,
        sessionId: SESSION_ID,
        branchName: 'main',
        turnMessages: [
          {
            role: 'user',
            id: 'user-1',
            content: [{ type: 'text', content: 'Please explain what changed.' }],
          },
          buildAssistantMessage({
            modelId: 'codex/gpt-5.4',
            responseText: 'I updated the file and the tests are passing.',
          }),
        ],
      })
    ).resolves.toBeNull();

    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual(
      []
    );
    expect(mockLlm).not.toHaveBeenCalled();
  });

  it('returns null when tool trace messages are below the compaction token threshold', async () => {
    const toolCallingAssistant = buildAssistantMessage({
      modelId: 'codex/gpt-5.4',
      toolCalls: [
        {
          name: 'read',
          arguments: { path: '/tmp/project/src/app.ts' },
          toolCallId: 'call-1',
        },
      ],
    });

    await expect(
      persistCompletedTurnCompaction({
        projectId: PROJECT_ID,
        artifactDirId: ARTIFACT_ID,
        sessionId: SESSION_ID,
        branchName: 'main',
        turnMessages: [
          {
            role: 'user',
            id: 'user-1',
            content: [{ type: 'text', content: 'Inspect the app file.' }],
          },
          toolCallingAssistant,
          {
            role: 'toolResult',
            id: 'tool-1',
            toolName: 'read',
            toolCallId: 'call-1',
            content: [{ type: 'text', content: 'small result' }],
            isError: false,
            timestamp: Date.now(),
          },
          buildAssistantMessage({
            modelId: 'codex/gpt-5.4',
            responseText: 'I checked the file and it looks fine.',
          }),
        ],
      })
    ).resolves.toBeNull();

    await expect(getSessionCompactionNodes(PROJECT_ID, ARTIFACT_ID, SESSION_ID)).resolves.toEqual(
      []
    );
    expect(mockLlm).not.toHaveBeenCalled();
  });
});
