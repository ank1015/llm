import { getModel } from '@ank1015/llm-core';
import { describe, expect, it, vi, afterEach } from 'vitest';

import type { Api, BaseAssistantMessage, Message } from '@ank1015/llm-sdk';

const mockLlm = vi.fn();
const mockCreateTurnCompactionPrompt = vi.fn(() => 'turn compaction prompt');
const mockCreateOngoingTurnCompactionPrompt = vi.fn(() => 'ongoing turn compaction prompt');
const mockCreateUltraCompactionPrompt = vi.fn(() => 'ultra compaction prompt');
const mockGetRegisteredSkill = vi.fn();
const mockListRegisteredSkills = vi.fn();

vi.mock('@ank1015/llm-agents', () => ({
  createOngoingTurnCompactionPrompt: mockCreateOngoingTurnCompactionPrompt,
  createTurnCompactionPrompt: mockCreateTurnCompactionPrompt,
  createUltraCompactionPrompt: mockCreateUltraCompactionPrompt,
  getRegisteredSkill: mockGetRegisteredSkill,
  listRegisteredSkills: mockListRegisteredSkills,
}));

vi.mock('@ank1015/llm-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ank1015/llm-sdk')>();
  return {
    ...actual,
    llm: mockLlm,
  };
});

const { compactOngoingTurn, compactTurn, compactUltra } =
  await import('../../../../src/core/session/compaction.js');

afterEach(() => {
  mockLlm.mockReset();
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
  thinkingText?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; toolCallId: string }>;
}): BaseAssistantMessage<Api> {
  const { api, providerModelId } = splitCuratedModelId(input.modelId);
  const model = getModel(api, providerModelId as never);
  if (!model) {
    throw new Error(`Model not found for ${input.modelId}`);
  }

  const content: BaseAssistantMessage<Api>['content'] = [];
  if (input.thinkingText) {
    content.push({
      type: 'thinking',
      thinkingText: input.thinkingText,
    });
  }
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

describe('compactTurn', () => {
  it('renders a turn into markdown and returns the compaction summary text', async () => {
    mockLlm.mockResolvedValue(
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Read /tmp/project/src/app.ts, updated logic, and ran tests.',
      })
    );

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [
          { type: 'text', content: 'Update the app logic.' },
          {
            type: 'file',
            data: 'ZmFrZS1ieXRlcw==',
            mimeType: 'text/plain',
            filename: 'notes.txt',
            metadata: {
              artifactAbsolutePath: '/tmp/project/.max/user-artifacts/notes.txt',
            },
          },
        ],
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'I will inspect the current implementation.',
        toolCalls: [
          {
            name: 'read',
            arguments: { path: '/tmp/project/src/app.ts' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'export const value = 1;\n' }],
        isError: false,
        timestamp: Date.now(),
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Updated the logic and verified the tests passed.',
      }),
    ];

    await expect(compactTurn(messages)).resolves.toBe(
      'Read /tmp/project/src/app.ts, updated logic, and ran tests.'
    );

    expect(mockLlm).toHaveBeenCalledOnce();
    expect(mockLlm).toHaveBeenCalledWith({
      modelId: 'codex/gpt-5.4',
      messages: [
        {
          role: 'user',
          id: expect.any(String),
          content: [
            {
              type: 'text',
              content: expect.stringContaining('## User messages'),
            },
          ],
        },
      ],
      system: 'turn compaction prompt',
      reasoningEffort: 'medium',
    });

    const markdown = mockLlm.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.content as string;
    expect(markdown).toContain('### Tool call: read');
    expect(markdown).toContain('/tmp/project/src/app.ts');
    expect(markdown).toContain('### Tool result: read');
    expect(markdown).toContain('## Final assistant reply');
    expect(markdown).toContain('/tmp/project/.max/user-artifacts/notes.txt');
    expect(markdown).not.toContain('ZmFrZS1ieXRlcw==');
  });

  it('mentions a missing final assistant reply when the turn ends before one is produced', async () => {
    mockLlm.mockResolvedValue(
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'The turn ended after tool execution without a final reply.',
      })
    );

    await compactTurn([
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Run the build.' }],
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        toolCalls: [
          {
            name: 'bash',
            arguments: { command: 'pnpm build' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'bash',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'Build interrupted.' }],
        isError: true,
        error: { message: 'Command terminated early' },
        timestamp: Date.now(),
      },
    ]);

    const markdown = mockLlm.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.content as string;
    expect(markdown).toContain('No final assistant message.');
  });

  it('rejects turns that contain a user message after assistant or tool activity starts', async () => {
    await expect(
      compactTurn([
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'First' }],
        },
        buildAssistantMessage({
          modelId: 'codex/gpt-5.4',
          toolCalls: [
            {
              name: 'read',
              arguments: { path: '/tmp/project/file.ts' },
              toolCallId: 'call-1',
            },
          ],
        }),
        {
          role: 'user',
          id: 'user-2',
          content: [{ type: 'text', content: 'This should not be here' }],
        },
      ])
    ).rejects.toThrow(
      'Turn compaction requires all user messages to appear before assistant or tool messages'
    );
  });
});

describe('compactUltra', () => {
  it('renders user messages, system-generated summaries, and assistant replies into ultra-compaction markdown', async () => {
    mockLlm.mockResolvedValue(
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Earlier work updated the app logic and preserved the key constraints.',
      })
    );

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Fix the app logic.' }],
      },
      {
        role: 'user',
        id: 'user-2',
        content: [
          {
            type: 'text',
            content:
              '<max_system_generated_message>Read /tmp/project/src/app.ts and updated the validation flow.</max_system_generated_message>',
          },
        ],
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        thinkingText: 'ignore this',
        responseText: 'Updated the app logic and the tests pass now.',
        toolCalls: [
          {
            name: 'read',
            arguments: { path: '/tmp/project/src/app.ts' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'user',
        id: 'user-3',
        content: [{ type: 'text', content: 'Now add a second validation rule.' }],
      },
    ];

    await expect(compactUltra(messages)).resolves.toBe(
      'Earlier work updated the app logic and preserved the key constraints.'
    );

    expect(mockLlm).toHaveBeenCalledOnce();
    expect(mockLlm).toHaveBeenCalledWith({
      modelId: 'codex/gpt-5.4',
      messages: [
        {
          role: 'user',
          id: expect.any(String),
          content: [
            {
              type: 'text',
              content: expect.stringContaining('## User message'),
            },
          ],
        },
      ],
      system: 'ultra compaction prompt',
      reasoningEffort: 'medium',
    });

    const markdown = mockLlm.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.content as string;
    expect(markdown).toContain('## User message');
    expect(markdown).toContain('### Assistant turn summary');
    expect(markdown).toContain('Read /tmp/project/src/app.ts and updated the validation flow.');
    expect(markdown).toContain('## Assistant reply');
    expect(markdown).toContain('Updated the app logic and the tests pass now.');
    expect(markdown).not.toContain('<max_system_generated_message>');
    expect(markdown).not.toContain('### Tool call: read');
    expect(markdown).not.toContain('ignore this');
  });

  it('rejects ultra compaction inputs that include unsupported message roles', async () => {
    await expect(
      compactUltra([
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Start from here.' }],
        },
        {
          role: 'toolResult',
          id: 'tool-1',
          toolName: 'read',
          toolCallId: 'call-1',
          content: [{ type: 'text', content: 'unsupported' }],
          isError: false,
          timestamp: Date.now(),
        },
      ])
    ).rejects.toThrow(
      'Ultra compaction only supports user and assistant messages, received "toolResult"'
    );
  });
});

describe('compactOngoingTurn', () => {
  it('renders the in-progress turn trace into markdown and returns the compaction summary text', async () => {
    mockLlm.mockResolvedValue(
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Read /tmp/project/src/app.ts and started updating the implementation.',
      })
    );

    const messages: Message[] = [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Keep working on the app logic.' }],
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Inspecting the current file first.',
        toolCalls: [
          {
            name: 'read',
            arguments: { path: '/tmp/project/src/app.ts' },
            toolCallId: 'call-1',
          },
        ],
      }),
      {
        role: 'toolResult',
        id: 'tool-1',
        toolName: 'read',
        toolCallId: 'call-1',
        content: [{ type: 'text', content: 'export const value = 1;\n' }],
        isError: false,
        timestamp: Date.now(),
      },
      buildAssistantMessage({
        modelId: 'codex/gpt-5.4',
        responseText: 'Preparing the next edit.',
      }),
    ];

    await expect(compactOngoingTurn(messages)).resolves.toBe(
      'Read /tmp/project/src/app.ts and started updating the implementation.'
    );

    expect(mockLlm).toHaveBeenCalledOnce();
    expect(mockLlm).toHaveBeenCalledWith({
      modelId: 'codex/gpt-5.4',
      messages: [
        {
          role: 'user',
          id: expect.any(String),
          content: [
            {
              type: 'text',
              content: expect.stringContaining('## User messages'),
            },
          ],
        },
      ],
      system: 'ongoing turn compaction prompt',
      reasoningEffort: 'medium',
    });

    const markdown = mockLlm.mock.calls[0]?.[0]?.messages?.[0]?.content?.[0]?.content as string;
    expect(markdown).toContain('### Tool call: read');
    expect(markdown).toContain('### Tool result: read');
    expect(markdown).toContain('Preparing the next edit.');
    expect(markdown).not.toContain('## Final assistant reply');
  });

  it('rejects ongoing turns that contain a user message after assistant or tool activity starts', async () => {
    await expect(
      compactOngoingTurn([
        {
          role: 'user',
          id: 'user-1',
          content: [{ type: 'text', content: 'Start working.' }],
        },
        buildAssistantMessage({
          modelId: 'codex/gpt-5.4',
          toolCalls: [
            {
              name: 'read',
              arguments: { path: '/tmp/project/src/app.ts' },
              toolCallId: 'call-1',
            },
          ],
        }),
        {
          role: 'user',
          id: 'user-2',
          content: [{ type: 'text', content: 'Actually do something else.' }],
        },
      ])
    ).rejects.toThrow(
      'Turn compaction requires all user messages to appear before assistant or tool messages'
    );
  });
});
