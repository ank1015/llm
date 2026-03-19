import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Api, BaseAssistantMessage, MessageNode } from '@ank1015/llm-types';

import { AssistantMessages } from '@/components/assistant-messages';


function createAssistantMessage(input: {
  id: string;
  api?: Api;
  content: BaseAssistantMessage<Api>['content'];
  timestamp?: number;
}): BaseAssistantMessage<Api> {
  const api = input.api ?? 'openai';
  const timestamp = input.timestamp ?? 1000;

  return {
    role: 'assistant',
    id: input.id,
    api,
    model: {
      id: `${api}-model`,
      name: `${api} model`,
      api,
      baseUrl: 'https://example.com',
      reasoning: true,
      input: ['text'],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 200000,
      maxTokens: 8192,
      tools: ['bash'],
    },
    timestamp,
    duration: 10,
    stopReason: 'stop',
    content: input.content,
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
    message: {} as never,
  };
}

function createAssistantNode(message: BaseAssistantMessage<Api>): MessageNode {
  return {
    type: 'message',
    id: `node-${message.id}`,
    parentId: 'user-node',
    branch: 'main',
    timestamp: new Date(message.timestamp).toISOString(),
    message,
    api: message.api,
    modelId: message.model.id,
    providerOptions: {},
  };
}

describe('AssistantMessages', () => {
  it('renders a unified non-collapsible streaming assistant surface', () => {
    const assistant = createAssistantMessage({
      id: 'assistant-live',
      content: [
        {
          type: 'response',
          content: [{ type: 'text', content: 'Before tool' }],
        },
        {
          type: 'toolCall',
          name: 'bash',
          toolCallId: 'tool-1',
          arguments: { command: 'echo hello' },
        },
        {
          type: 'response',
          content: [{ type: 'text', content: 'After tool' }],
        },
      ],
    });
    const { message: _nativeMessage, ...streamingAssistant } = assistant;

    render(
      <AssistantMessages
        cotMessages={[]}
        assistantNode={null}
        isStreamingTurn
        streamingAssistant={streamingAssistant}
        api="openai"
        sessionKey={null}
        userTimestamp={null}
      />
    );

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Working' })).not.toBeInTheDocument();
    expect(screen.getByText('Before tool')).toBeInTheDocument();
    expect(screen.getByText('After tool')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bash echo hello/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Copy message')).not.toBeInTheDocument();
  });

  it('keeps completed turns collapsible and renders the final response separately', () => {
    const assistant = createAssistantMessage({
      id: 'assistant-complete',
      content: [
        {
          type: 'response',
          content: [{ type: 'text', content: 'Before tool' }],
        },
        {
          type: 'toolCall',
          name: 'bash',
          toolCallId: 'tool-1',
          arguments: { command: 'echo hello' },
        },
        {
          type: 'response',
          content: [{ type: 'text', content: 'Final answer' }],
        },
      ],
    });

    render(
      <AssistantMessages
        cotMessages={[assistant]}
        assistantNode={createAssistantNode(assistant)}
        isStreamingTurn={false}
        streamingAssistant={null}
        api="openai"
        sessionKey={null}
        userTimestamp={null}
      />
    );

    expect(screen.getByRole('button', { name: /Worked/ })).toBeInTheDocument();
    expect(screen.getByText('Final answer')).toBeInTheDocument();
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument();
    expect(screen.queryByText('Before tool')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Worked/ }));

    expect(screen.getByText('Before tool')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bash echo hello/i })).toBeInTheDocument();
  });
});
