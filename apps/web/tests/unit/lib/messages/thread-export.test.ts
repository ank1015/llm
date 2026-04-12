import { describe, expect, it } from 'vitest';

import type { MessageNode } from '@/stores/types';
import type {
  Api,
  BaseAssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
} from '@ank1015/llm-sdk';

import { formatThreadMarkdownExport } from '@/lib/messages/thread-export';


function createUserNode(input: {
  nodeId: string;
  messageId: string;
  text: string;
  attachments?: UserMessage['content'];
}): MessageNode {
  return {
    type: 'message',
    id: input.nodeId,
    parentId: 'session-1',
    branch: 'main',
    timestamp: '2026-04-09T00:00:00.000Z',
    message: {
      role: 'user',
      id: input.messageId,
      timestamp: Date.now(),
      content: [{ type: 'text', content: input.text }, ...(input.attachments ?? [])],
    },
    metadata: {
      modelId: 'codex/gpt-5.4',
    },
  };
}

function createAssistantMessage(input: {
  id: string;
  content: BaseAssistantMessage<Api>['content'];
}): BaseAssistantMessage<'codex'> {
  return {
    role: 'assistant',
    id: input.id,
    api: 'codex',
    message: {} as BaseAssistantMessage<'codex'>['message'],
    model: {
      id: 'gpt-5.4',
      api: 'codex',
      name: 'GPT-5.4',
      baseUrl: 'https://example.com',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: [],
    },
    timestamp: Date.now(),
    duration: 100,
    stopReason: 'stop',
    content: input.content,
    usage: {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
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

function createAssistantNode(input: {
  nodeId: string;
  messageId: string;
  content: BaseAssistantMessage<Api>['content'];
}): MessageNode {
  return {
    type: 'message',
    id: input.nodeId,
    parentId: 'session-1',
    branch: 'main',
    timestamp: '2026-04-09T00:00:01.000Z',
    message: createAssistantMessage({
      id: input.messageId,
      content: input.content,
    }),
    metadata: {
      modelId: 'codex/gpt-5.4',
    },
  };
}

function createToolResult(input: {
  id: string;
  toolCallId: string;
  toolName: string;
  text: string;
  isError?: boolean;
}): ToolResultMessage {
  return {
    role: 'toolResult',
    id: input.id,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    content: input.text.length > 0 ? [{ type: 'text', content: input.text }] : [],
    isError: input.isError ?? false,
    timestamp: Date.now(),
  };
}

describe('formatThreadMarkdownExport', () => {
  it('formats a thread export with system prompt, trace items, and final response', () => {
    const firstUser = createUserNode({
      nodeId: 'user-node-1',
      messageId: 'user-1',
      text: 'Explain the bug.',
      attachments: [
        {
          type: 'file',
          filename: 'error.log',
          mimeType: 'text/plain',
          data: 'ZHVtbXk=',
          metadata: {
            originalFileName: 'error.log',
          },
        },
      ],
    });
    const firstAssistant = createAssistantNode({
      nodeId: 'assistant-node-1',
      messageId: 'assistant-1',
      content: [
        {
          type: 'response',
          response: [{ type: 'text', content: 'The failure comes from parser state.' }],
        },
      ],
    });
    const secondUser = createUserNode({
      nodeId: 'user-node-2',
      messageId: 'user-2',
      text: 'Can you patch it?',
    });
    const secondAssistant = createAssistantNode({
      nodeId: 'assistant-node-2',
      messageId: 'assistant-2',
      content: [{ type: 'response', response: [{ type: 'text', content: 'Yes.' }] }],
    });

    const markdown = formatThreadMarkdownExport({
      turns: [
        {
          userNode: firstUser,
          cotMessages: [
            createAssistantMessage({
              id: 'assistant-tool',
              content: [
                { type: 'thinking', thinkingText: '**Plan**\n\nInspect the failing tool output.' },
                {
                  type: 'toolCall',
                  name: 'bash',
                  toolCallId: 'tool-1',
                  arguments: {
                    command: 'pnpm test',
                  },
                },
                { type: 'response', response: [{ type: 'text', content: 'Intermediate note.' }] },
              ],
            }) as Message,
            createToolResult({
              id: 'tool-result-1',
              toolCallId: 'tool-1',
              toolName: 'bash',
              text: '1 test failed',
            }) as Message,
          ],
          assistantNode: firstAssistant,
          api: 'codex',
        },
        {
          userNode: secondUser,
          cotMessages: [],
          assistantNode: secondAssistant,
          api: 'codex',
        },
      ],
      endTurnIndex: 0,
      systemPrompt: 'You are a careful assistant.',
    });

    expect(markdown).toContain('# System prompt');
    expect(markdown).toContain('You are a careful assistant.');
    expect(markdown).toContain('# User message');
    expect(markdown).toContain('Explain the bug.');
    expect(markdown).toContain('## Attachments');
    expect(markdown).toContain('`error.log`');
    expect(markdown).toContain('# Assistant message');
    expect(markdown).toContain('## Tool Call');
    expect(markdown).toContain('`bash`');
    expect(markdown).toContain('pnpm test');
    expect(markdown).toContain('## Tool Result');
    expect(markdown).toContain('1 test failed');
    expect(markdown).toContain('## Assistant note');
    expect(markdown).toContain('Intermediate note.');
    expect(markdown).toContain('## Response');
    expect(markdown).toContain('The failure comes from parser state.');
    expect(markdown).not.toContain('## Thinking');
    expect(markdown).not.toContain('Inspect the failing tool output.');
    expect(markdown).not.toContain('Can you patch it?');
    expect(markdown).not.toContain('Yes.');
  });

  it('omits the system prompt heading when no prompt is available', () => {
    const user = createUserNode({
      nodeId: 'user-node-1',
      messageId: 'user-1',
      text: 'Hello',
    });
    const assistant = createAssistantNode({
      nodeId: 'assistant-node-1',
      messageId: 'assistant-1',
      content: [{ type: 'response', response: [{ type: 'text', content: 'Hi there' }] }],
    });

    const markdown = formatThreadMarkdownExport({
      turns: [
        {
          userNode: user,
          cotMessages: [],
          assistantNode: assistant,
          api: 'codex',
        },
      ],
      endTurnIndex: 0,
    });

    expect(markdown).not.toContain('# System prompt');
    expect(markdown).toContain('Hi there');
  });
});
