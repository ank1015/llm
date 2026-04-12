import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectFileIndexEntryDto } from '@/lib/client-api';

import { ArtifactChatComposer } from '@/components/artifact-chat-composer';
import { MENTION_SEARCH_DEBOUNCE_MS, MENTION_SEARCH_LIMIT } from '@/lib/messages/composer-mentions';
import { useArtifactFilesStore } from '@/stores/artifact-files-store';
import { useChatStore } from '@/stores/chat-store';
import { useComposerStore } from '@/stores/composer-store';
import { useSessionsStore } from '@/stores/sessions-store';


const CURRENT_ARTIFACT_ROOT: ProjectFileIndexEntryDto = {
  artifactId: 'artifact-1',
  artifactName: 'Artifact 1',
  path: '',
  type: 'directory',
  artifactPath: 'artifact-1/',
  size: 0,
  updatedAt: '2026-03-27T00:00:00.000Z',
};

const SIBLING_ARTIFACT_ROOT: ProjectFileIndexEntryDto = {
  artifactId: 'artifact-2',
  artifactName: 'Artifact 2',
  path: '',
  type: 'directory',
  artifactPath: 'artifact-2/',
  size: 0,
  updatedAt: '2026-03-27T00:00:00.000Z',
};

const originalSearchProjectFiles = useArtifactFilesStore.getState().searchProjectFiles;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/components/prompt-model-picker', () => ({
  PromptModelPicker: () => <div data-testid="prompt-model-picker" />,
}));

vi.mock('@/components/prompt-reasoning-picker', () => ({
  PromptReasoningPicker: () => <div data-testid="prompt-reasoning-picker" />,
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
    directoriesByArtifact: {},
    filesByArtifact: {},
    selectedFileByArtifact: {},
    previewModeByArtifact: {},
    selectedDiffFileByArtifact: {},
    directoryLoadingByKey: {},
    fileLoadingByKey: {},
    directoryErrorByKey: {},
    fileErrorByKey: {},
    projectFileIndexByProject: {},
    projectFileIndexTruncatedByProject: {},
    projectFileIndexLoadingByProject: {},
    projectFileIndexErrorByProject: {},
    searchProjectFiles: originalSearchProjectFiles,
  });
}

function resetComposerStore(): void {
  useComposerStore.getState().reset();
  useComposerStore.persist.clearStorage();
  localStorage.clear();
}

describe('ArtifactChatComposer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    resetChatStore();
    resetArtifactFilesStore();
    resetComposerStore();
    useSessionsStore.getState().reset();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    resetArtifactFilesStore();
    resetComposerStore();
  });

  it('lets users select the current artifact root from @ mentions in local draft mode', async () => {
    const searchProjectFiles = vi.fn().mockResolvedValue([CURRENT_ARTIFACT_ROOT]);
    useArtifactFilesStore.setState({
      searchProjectFiles,
    });

    render(<ArtifactChatComposer projectId="project-1" artifactId="artifact-1" />);

    const textarea = screen.getByPlaceholderText(
      'Ask about this artifact or start a thread…'
    ) as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.focus(textarea);
      fireEvent.change(textarea, {
        target: {
          value: '@artifact-1/',
        },
      });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.select(textarea);
      vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS + 40);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(searchProjectFiles).toHaveBeenCalledWith(
      'project-1',
      'artifact-1/',
      MENTION_SEARCH_LIMIT
    );
    expect(screen.getByText('Artifact 1/')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textarea.value).toBe('@./ ');
  });

  it('updates the session draft when selecting a mention inside a thread composer', async () => {
    const searchProjectFiles = vi.fn().mockResolvedValue([CURRENT_ARTIFACT_ROOT]);
    useArtifactFilesStore.setState({
      searchProjectFiles,
    });

    render(
      <ArtifactChatComposer projectId="project-1" artifactId="artifact-1" sessionId="session-1" />
    );

    const textarea = screen.getByPlaceholderText('Ask me anything...') as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.focus(textarea);
      fireEvent.change(textarea, {
        target: {
          value: '@artifact-1/',
        },
      });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.select(textarea);
      vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS + 40);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Artifact 1/')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useComposerStore.getState().draftsBySession['session-1']).toBe('@./ ');
  });

  it('supports arrow navigation and enter selection inside the mention dropdown', async () => {
    const searchProjectFiles = vi
      .fn()
      .mockResolvedValue([CURRENT_ARTIFACT_ROOT, SIBLING_ARTIFACT_ROOT]);
    useArtifactFilesStore.setState({
      searchProjectFiles,
    });

    render(<ArtifactChatComposer projectId="project-1" artifactId="artifact-1" />);

    const textarea = screen.getByPlaceholderText(
      'Ask about this artifact or start a thread…'
    ) as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.focus(textarea);
      fireEvent.change(textarea, {
        target: {
          value: '@',
        },
      });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.select(textarea);
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Artifact 1/')).toBeInTheDocument();
    expect(screen.getByText('Artifact 2/')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'ArrowDown' });
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
      vi.runOnlyPendingTimers();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(textarea.value).toBe('@../artifact-2/ ');
  });

  it('caps the composer textarea at 220px when autosizing past the limit', async () => {
    render(<ArtifactChatComposer projectId="project-1" artifactId="artifact-1" />);

    const textarea = screen.getByPlaceholderText(
      'Ask about this artifact or start a thread…'
    ) as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => 400,
    });

    await act(async () => {
      fireEvent.change(textarea, {
        target: {
          value: 'A long draft that should clamp the autosized textarea height.',
        },
      });
    });

    expect(textarea.style.height).toBe('220px');
  });

  it('closes the mention dropdown on escape', async () => {
    const searchProjectFiles = vi.fn().mockResolvedValue([CURRENT_ARTIFACT_ROOT]);
    useArtifactFilesStore.setState({
      searchProjectFiles,
    });

    render(<ArtifactChatComposer projectId="project-1" artifactId="artifact-1" />);

    const textarea = screen.getByPlaceholderText(
      'Ask about this artifact or start a thread…'
    ) as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.focus(textarea);
      fireEvent.change(textarea, {
        target: {
          value: '@artifact-1/',
        },
      });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.select(textarea);
      vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS + 40);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Artifact 1/')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(screen.queryByText('Artifact 1/')).not.toBeInTheDocument();
  });

  it('does not open a dropdown when @ is not at a valid boundary', async () => {
    const searchProjectFiles = vi.fn().mockResolvedValue([CURRENT_ARTIFACT_ROOT]);
    useArtifactFilesStore.setState({
      searchProjectFiles,
    });

    render(<ArtifactChatComposer projectId="project-1" artifactId="artifact-1" />);

    const textarea = screen.getByPlaceholderText(
      'Ask about this artifact or start a thread…'
    ) as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.focus(textarea);
      fireEvent.change(textarea, {
        target: {
          value: 'hello@artifact-1/',
        },
      });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      fireEvent.select(textarea);
      vi.advanceTimersByTime(MENTION_SEARCH_DEBOUNCE_MS + 40);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(searchProjectFiles).not.toHaveBeenCalled();
    expect(screen.queryByText('Artifact 1/')).not.toBeInTheDocument();
  });
});
