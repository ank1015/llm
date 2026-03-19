import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api, BaseAssistantMessage, MessageNode, UserMessage } from '@ank1015/llm-types';

import { ChatMessages } from '@/components/chat-messages';
import { useChatStore } from '@/stores/chat-store';


vi.mock('next/navigation', () => ({
  useParams: () => ({
    projectId: 'project-1',
    artifactId: 'artifact-1',
    threadId: 'session-1',
  }),
}));

function resetChatStore(): void {
  useChatStore.setState({
    activeSession: null,
    messagesBySession: {},
    messageTreesBySession: {},
    persistedLeafNodeIdBySession: {},
    visibleLeafNodeIdBySession: {},
    liveRunBySession: {},
    lastSeqBySession: {},
    streamingAssistantBySession: {},
    pendingPromptsBySession: {},
    agentEventsBySession: {},
    isLoadingMessagesBySession: {},
    isStreamingBySession: {},
    errorsBySession: {},
  });
}

function createUserNode(message: UserMessage): MessageNode {
  return {
    type: 'message',
    id: 'user-node',
    parentId: null,
    branch: 'main',
    timestamp: new Date(message.timestamp ?? 1000).toISOString(),
    message,
    api: 'openai',
    modelId: 'openai-model',
    providerOptions: {},
  };
}

function createStreamingAssistant(input: {
  id: string;
  api: Api;
  content: BaseAssistantMessage<Api>['content'];
}): Omit<BaseAssistantMessage<Api>, 'message'> {
  const assistant: BaseAssistantMessage<Api> = {
    role: 'assistant',
    id: input.id,
    api: input.api,
    model: {
      id: `${input.api}-model`,
      name: `${input.api} model`,
      api: input.api,
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
    timestamp: 2000,
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
  const { message: _nativeMessage, ...streamingAssistant } = assistant;
  return streamingAssistant;
}

describe('ChatMessages', () => {
  beforeEach(() => {
    resetChatStore();
  });

  it('uses the streaming assistant api when no persisted assistant node exists yet', () => {
    const userMessage: UserMessage = {
      role: 'user',
      id: 'user-1',
      timestamp: 1000,
      content: [{ type: 'text', content: 'Hello' }],
    };

    useChatStore.setState({
      activeSession: { sessionId: 'session-1' },
      messagesBySession: {
        'session-1': [createUserNode(userMessage)],
      },
      messageTreesBySession: {
        'session-1': [createUserNode(userMessage)],
      },
      streamingAssistantBySession: {
        'session-1': createStreamingAssistant({
          id: 'assistant-1',
          api: 'anthropic',
          content: [
            {
              type: 'thinking',
              thinkingText: '### Plan\n\nBody',
            },
          ],
        }),
      },
      isStreamingBySession: {
        'session-1': true,
      },
    });

    render(<ChatMessages />);

    expect(screen.getByRole('heading', { name: 'Plan', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
