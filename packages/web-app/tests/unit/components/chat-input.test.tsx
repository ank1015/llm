import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/chat-input';
import { useChatStore } from '@/stores/chat-store';
import { useComposerStore } from '@/stores/composer-store';

vi.mock('next/navigation', () => ({
  useParams: () => ({
    projectId: 'project-1',
    artifactId: 'artifact-1',
    threadId: undefined,
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/components/artifact-skills-panel', () => ({
  ArtifactSkillsPanel: () => null,
}));

vi.mock('@/components/context-usage-indicator', () => ({
  ContextUsageIndicator: () => null,
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

describe('ChatInput', () => {
  beforeEach(() => {
    resetChatStore();
    useComposerStore.getState().reset();
  });

  it('renders on an artifact page before a thread exists', () => {
    render(<ChatInput />);

    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });
});
