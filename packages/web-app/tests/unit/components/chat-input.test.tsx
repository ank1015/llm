import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/chat-input';
import { useArtifactFilesStore } from '@/stores';
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

function resetArtifactFilesStore(): void {
  useArtifactFilesStore.setState({
    projectFileIndexByProject: {},
    projectFileIndexTruncatedByProject: {},
    projectFileIndexLoadingByProject: {},
    projectFileIndexErrorByProject: {},
  });
}

describe('ChatInput', () => {
  beforeEach(() => {
    resetChatStore();
    resetArtifactFilesStore();
    useComposerStore.getState().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders on an artifact page before a thread exists', () => {
    render(<ChatInput />);

    expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument();
  });

  it('lets users select the current artifact root from @ mentions', async () => {
    const searchProjectFiles = vi.fn().mockResolvedValue([
      {
        artifactId: 'artifact-1',
        artifactName: 'Artifact 1',
        path: '',
        type: 'directory',
        artifactPath: 'artifact-1/',
        size: 0,
        updatedAt: '2026-03-27T00:00:00.000Z',
      },
    ]);

    useArtifactFilesStore.setState({
      searchProjectFiles,
    });

    render(<ChatInput />);

    const textarea = screen.getByPlaceholderText('Ask me anything...') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    fireEvent.change(textarea, {
      target: {
        value: '@artifact-1/',
      },
    });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.select(textarea);

    await waitFor(() => {
      expect(searchProjectFiles).toHaveBeenCalledWith('project-1', 'artifact-1/', 80);
    });
    expect(screen.getByText('Artifact 1/')).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(textarea.value).toBe('@./ ');
    });
  });
});
