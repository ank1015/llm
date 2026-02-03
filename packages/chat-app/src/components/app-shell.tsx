'use client';

import { useEffect, useMemo, useState } from 'react';

import type { SessionRef } from '@/lib/contracts';
import type { AgentEvent, Content, Message, MessageNode, SessionSummary } from '@ank1015/llm-sdk';

import { useChatSettingsStore } from '@/stores/chat-settings-store';
import { useChatStore } from '@/stores/chat-store';
import { useComposerStore } from '@/stores/composer-store';
import { useProvidersStore } from '@/stores/providers-store';
import { useSessionsStore } from '@/stores/sessions-store';
import { useUiStore } from '@/stores/ui-store';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'chat-app-theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function getSessionKey(session: SessionRef): string {
  const projectName = normalizeText(session.projectName) ?? '';
  const path = normalizeText(session.path) ?? '';
  return `${projectName}::${path}::${session.sessionId}`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contentToText(content: Content): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      const text = block.content.trim();
      if (text.length > 0) {
        parts.push(text);
      }
      continue;
    }

    if (block.type === 'image') {
      parts.push('[Image]');
      continue;
    }

    if (block.type === 'file') {
      parts.push(`[File: ${block.filename}]`);
    }
  }

  return parts.join('\n');
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function messageToText(message: Message): string {
  if (message.role === 'user') {
    return contentToText(message.content);
  }

  if (message.role === 'toolResult') {
    return contentToText(message.content);
  }

  if (message.role === 'assistant') {
    const segments: string[] = [];

    for (const part of message.content) {
      if (part.type === 'response') {
        const text = contentToText(part.content);
        if (text.length > 0) {
          segments.push(text);
        }
        continue;
      }

      if (part.type === 'thinking') {
        const thinking = part.thinkingText.trim();
        if (thinking.length > 0) {
          segments.push(`[Thinking] ${thinking}`);
        }
        continue;
      }

      if (part.type === 'toolCall') {
        segments.push(`[Tool call] ${part.name}`);
      }
    }

    return segments.join('\n');
  }

  try {
    return JSON.stringify(message.content);
  } catch {
    return '[Custom message]';
  }
}

function formatMessageTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractStreamingPreview(events: AgentEvent[]): string {
  let preview = '';

  for (const event of events) {
    if (event.type !== 'message_update' || event.messageType !== 'assistant') {
      continue;
    }

    const message = event.message;
    if (!isObjectRecord(message)) {
      continue;
    }

    if (message.type === 'text_delta' && typeof message.delta === 'string') {
      preview += message.delta;
    }
  }

  return preview.trim();
}

const EMPTY_MESSAGES: MessageNode[] = [];
const EMPTY_PENDING: never[] = [];
const EMPTY_EVENTS: AgentEvent[] = [];

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('aborted') ||
      error.message.toLowerCase().includes('abort')
    );
  }

  return false;
}

function getRegeneratePrompt(node: MessageNode, nodes: MessageNode[]): string | undefined {
  if (node.message.role !== 'assistant') {
    return undefined;
  }

  const parentId = node.parentId;
  if (!parentId) {
    return undefined;
  }

  const parentNode = nodes.find((item) => item.id === parentId);
  if (!parentNode || parentNode.message.role !== 'user') {
    return undefined;
  }

  const prompt = messageToText(parentNode.message).trim();
  return prompt.length > 0 ? prompt : undefined;
}

type SessionListProps = {
  sessions: SessionSummary[];
  activeSessionId: string | undefined;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  renamingSessionId: string | null;
  deletingSessionId: string | null;
  collapsed: boolean;
  onSelect: (sessionId: string) => void;
  onRename: (session: SessionSummary) => void;
  onDelete: (session: SessionSummary) => void;
  onLoadMore: () => void;
};

function SessionList(props: SessionListProps): React.ReactElement {
  const {
    sessions,
    activeSessionId,
    isLoading,
    hasMore,
    isLoadingMore,
    renamingSessionId,
    deletingSessionId,
    collapsed,
    onSelect,
    onRename,
    onDelete,
    onLoadMore,
  } = props;

  if (isLoading && sessions.length === 0) {
    return <p className="px-1 text-xs text-[var(--text-muted)]">Loading sessions...</p>;
  }

  if (sessions.length === 0) {
    return <p className="px-1 text-xs text-[var(--text-muted)]">No sessions found.</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {sessions.map((session) => {
          const isActive = session.sessionId === activeSessionId;
          const isRenaming = renamingSessionId === session.sessionId;
          const isDeleting = deletingSessionId === session.sessionId;

          return (
            <div
              key={session.sessionId}
              className={`rounded-md border px-2 py-2 ${
                isActive
                  ? 'border-[var(--accent)] bg-[var(--surface-muted)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-canvas)]'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(session.sessionId)}
                className="block w-full text-left"
              >
                <p className="truncate text-sm">{collapsed ? 'Chat' : session.sessionName}</p>
                {!collapsed ? (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {new Date(session.updatedAt).toLocaleString()}
                  </p>
                ) : null}
              </button>

              {!collapsed ? (
                <div className="mt-2 flex gap-1">
                  <button
                    type="button"
                    disabled={isDeleting || isRenaming}
                    onClick={() => onRename(session)}
                    className="rounded border border-[var(--border-default)] px-2 py-1 text-[11px] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRenaming ? 'Renaming...' : 'Rename'}
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting || isRenaming}
                    onClick={() => onDelete(session)}
                    className="rounded border border-[var(--border-default)] px-2 py-1 text-[11px] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {hasMore ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="mt-2 w-full rounded-md border border-[var(--border-default)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoadingMore ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
    </>
  );
}

type MessageThreadProps = {
  messages: MessageNode[];
  isStreaming: boolean;
  onRegenerate: (node: MessageNode) => void;
};

function MessageThread(props: MessageThreadProps): React.ReactElement {
  const { messages, isStreaming, onRegenerate } = props;

  if (messages.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-6 text-sm text-[var(--text-muted)]">
        No messages yet. Start the conversation with your first prompt.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      {messages.map((node) => {
        const role = node.message.role;
        const isUser = role === 'user';
        const text = messageToText(node.message) || '[No renderable text]';
        const timestamp = formatMessageTimestamp(node.timestamp);
        const canRegenerate = role === 'assistant';

        return (
          <article
            key={node.id}
            className={`rounded-xl border p-3 ${
              isUser
                ? 'ml-auto max-w-[90%] border-[var(--accent)]/45 bg-[var(--accent)]/10'
                : 'mr-auto max-w-[90%] border-[var(--border-default)] bg-[var(--surface-panel)]'
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                {role}
              </p>
              {timestamp ? (
                <p className="text-[11px] text-[var(--text-muted)]">{timestamp}</p>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{text}</p>

            {canRegenerate ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={isStreaming}
                  onClick={() => onRegenerate(node)}
                  className="rounded border border-[var(--border-default)] px-2 py-1 text-[11px] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Regenerate
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function AppShell(): React.ReactElement {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const isMobileSidebarOpen = useUiStore((state) => state.isMobileSidebarOpen);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const activeSettingsTab = useUiStore((state) => state.activeSettingsTab);
  const renameSessionId = useUiStore((state) => state.renameSessionId);
  const deleteSessionId = useUiStore((state) => state.deleteSessionId);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const toggleMobileSidebar = useUiStore((state) => state.toggleMobileSidebar);
  const closeMobileSidebar = useUiStore((state) => state.closeMobileSidebar);
  const openSettings = useUiStore((state) => state.openSettings);
  const closeSettings = useUiStore((state) => state.closeSettings);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);
  const openRenameSessionDialog = useUiStore((state) => state.openRenameSessionDialog);
  const closeRenameSessionDialog = useUiStore((state) => state.closeRenameSessionDialog);
  const openDeleteSessionDialog = useUiStore((state) => state.openDeleteSessionDialog);
  const closeDeleteSessionDialog = useUiStore((state) => state.closeDeleteSessionDialog);

  const sessions = useSessionsStore((state) => state.sessions);
  const scope = useSessionsStore((state) => state.scope);
  const query = useSessionsStore((state) => state.query);
  const hasMore = useSessionsStore((state) => state.hasMore);
  const isLoading = useSessionsStore((state) => state.isLoading);
  const isLoadingMore = useSessionsStore((state) => state.isLoadingMore);
  const isRefreshing = useSessionsStore((state) => state.isRefreshing);
  const isCreating = useSessionsStore((state) => state.isCreating);
  const renamingSessionId = useSessionsStore((state) => state.renamingSessionId);
  const deletingSessionId = useSessionsStore((state) => state.deletingSessionId);
  const sessionsError = useSessionsStore((state) => state.error);
  const mutationError = useSessionsStore((state) => state.mutationError);
  const setQuery = useSessionsStore((state) => state.setQuery);
  const clearMutationError = useSessionsStore((state) => state.clearMutationError);
  const fetchFirstPage = useSessionsStore((state) => state.fetchFirstPage);
  const fetchNextPage = useSessionsStore((state) => state.fetchNextPage);
  const refresh = useSessionsStore((state) => state.refresh);
  const createSession = useSessionsStore((state) => state.createSession);
  const renameSession = useSessionsStore((state) => state.renameSession);
  const deleteSession = useSessionsStore((state) => state.deleteSession);

  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const startStream = useChatStore((state) => state.startStream);
  const abortStream = useChatStore((state) => state.abortStream);
  const clearSessionState = useChatStore((state) => state.clearSessionState);
  const activeSessionKey = useMemo(() => {
    return activeSession ? getSessionKey(activeSession) : undefined;
  }, [activeSession]);

  const selectedApi = useProvidersStore((state) => state.selectedApi);
  const selectedModelId = useProvidersStore((state) => state.selectedModelId);
  const providersError = useProvidersStore((state) => state.error);
  const refreshCatalog = useProvidersStore((state) => state.refreshCatalog);

  const getEffectiveSettings = useChatSettingsStore((state) => state.getEffectiveSettings);

  const composerDraft = useComposerStore((state) => {
    if (!activeSessionKey) {
      return '';
    }

    return state.draftsBySession[activeSessionKey] ?? '';
  });
  const setComposerDraft = useComposerStore((state) => state.setDraft);
  const markComposerSubmitted = useComposerStore((state) => state.markSubmitted);

  const [theme, setTheme] = useState<ThemeMode>('light');
  const [searchInput, setSearchInput] = useState(query);
  const [renameDraft, setRenameDraft] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const resolvedTheme = isThemeMode(savedTheme) ? savedTheme : getSystemTheme();

    setTheme(resolvedTheme);
    applyTheme(resolvedTheme);
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(searchInput);
      void fetchFirstPage();
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [fetchFirstPage, searchInput, setQuery]);

  useEffect(() => {
    if (!renameSessionId) {
      setRenameDraft('');
      return;
    }

    const session = sessions.find((item) => item.sessionId === renameSessionId);
    setRenameDraft(session?.sessionName ?? '');
  }, [renameSessionId, sessions]);

  const activeMessages = useChatStore((state) => {
    if (!activeSessionKey) {
      return EMPTY_MESSAGES;
    }

    return state.messagesBySession[activeSessionKey] ?? EMPTY_MESSAGES;
  });

  const activePendingPrompts = useChatStore((state) => {
    if (!activeSessionKey) {
      return EMPTY_PENDING;
    }

    return state.pendingPromptsBySession[activeSessionKey] ?? EMPTY_PENDING;
  });

  const activeAgentEvents = useChatStore((state) => {
    if (!activeSessionKey) {
      return EMPTY_EVENTS;
    }

    return state.agentEventsBySession[activeSessionKey] ?? EMPTY_EVENTS;
  });

  const activeChatError = useChatStore((state) => {
    if (!activeSessionKey) {
      return null;
    }

    return state.errorsBySession[activeSessionKey] ?? null;
  });

  const isStreaming = useChatStore((state) => {
    if (!activeSessionKey) {
      return false;
    }

    return state.isStreamingBySession[activeSessionKey] ?? false;
  });

  const effectiveSettings = getEffectiveSettings(activeSession ?? undefined);
  const resolvedApi = effectiveSettings.api ?? selectedApi;
  const resolvedModelId = effectiveSettings.modelId ?? selectedModelId;

  const streamPreviewText = useMemo(() => {
    return extractStreamingPreview(activeAgentEvents);
  }, [activeAgentEvents]);

  const activeSessionId = activeSession?.sessionId;
  const hasModelSelection = Boolean(resolvedApi && resolvedModelId);

  const toggleTheme = (): void => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';

    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  const sidebarClassName = useMemo(() => {
    if (isSidebarCollapsed) {
      return 'w-20';
    }

    return 'w-80';
  }, [isSidebarCollapsed]);

  const toSessionRef = (sessionId: string): SessionRef => {
    return {
      sessionId,
      projectName: scope.projectName,
      path: scope.path,
    };
  };

  const handleSelectSession = async (sessionId: string): Promise<void> => {
    const sessionRef = toSessionRef(sessionId);
    setActiveSession(sessionRef);
    closeMobileSidebar();
    clearMutationError();
    setComposerError(null);

    try {
      await loadMessages({ session: sessionRef });
    } catch {
      // chat errors are in store
    }
  };

  const handleCreateSession = async (): Promise<SessionRef | undefined> => {
    clearMutationError();
    setComposerError(null);

    try {
      const created = await createSession({
        sessionName: 'New chat',
      });
      setActiveSession(created);
      closeMobileSidebar();
      await loadMessages({ session: created, force: true });
      return created;
    } catch {
      return undefined;
    }
  };

  const handleOpenRenameDialog = (session: SessionSummary): void => {
    clearMutationError();
    setRenameDraft(session.sessionName);
    openRenameSessionDialog(session.sessionId);
  };

  const handleSubmitRename = async (): Promise<void> => {
    if (!renameSessionId) {
      return;
    }

    try {
      await renameSession({
        sessionId: renameSessionId,
        sessionName: renameDraft,
      });
      closeRenameSessionDialog();
    } catch {
      // mutation error is in store
    }
  };

  const handleOpenDeleteDialog = (session: SessionSummary): void => {
    clearMutationError();
    openDeleteSessionDialog(session.sessionId);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteSessionId) {
      return;
    }

    try {
      await deleteSession({ sessionId: deleteSessionId });

      if (activeSession?.sessionId === deleteSessionId) {
        clearSessionState(activeSession);
        setActiveSession(null);
      }

      closeDeleteSessionDialog();
    } catch {
      // mutation error is in store
    }
  };

  const handleStreamPrompt = async (prompt: string): Promise<void> => {
    setComposerError(null);

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      return;
    }

    let session: SessionRef | undefined = activeSession ?? undefined;
    if (!session) {
      session = await handleCreateSession();
    }

    if (!session) {
      throw new Error('Could not create or select a session.');
    }

    const settings = getEffectiveSettings(session);
    const api = settings.api ?? selectedApi;
    const modelId = settings.modelId ?? selectedModelId;

    if (!api || !modelId) {
      throw new Error('Select a provider and model in Settings before sending a message.');
    }

    await startStream({
      sessionId: session.sessionId,
      projectName: session.projectName,
      path: session.path,
      prompt: trimmedPrompt,
      api,
      modelId,
      systemPrompt: settings.systemPrompt.trim().length > 0 ? settings.systemPrompt : undefined,
      providerOptions: settings.providerOptions,
    });

    markComposerSubmitted(session);
  };

  const handleSend = async (): Promise<void> => {
    try {
      await handleStreamPrompt(composerDraft);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (error instanceof Error) {
        setComposerError(error.message);
        return;
      }

      setComposerError('Failed to send message.');
    }
  };

  const handleRegenerate = async (node: MessageNode): Promise<void> => {
    const prompt = getRegeneratePrompt(node, activeMessages);
    if (!prompt) {
      setComposerError('Could not resolve a prompt to regenerate.');
      return;
    }

    try {
      await handleStreamPrompt(prompt);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (error instanceof Error) {
        setComposerError(error.message);
        return;
      }

      setComposerError('Failed to regenerate response.');
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (isStreaming) {
      return;
    }

    void handleSend();
  };

  const handleStopStream = (): void => {
    if (!activeSession) {
      return;
    }

    abortStream(activeSession);
  };

  const activeSessionName =
    sessions.find((session) => session.sessionId === activeSessionId)?.sessionName ??
    'No session selected';

  const sidebarContent = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        {!isSidebarCollapsed ? <p className="text-sm font-semibold">Sessions</p> : null}
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          className="hidden rounded-md border border-[var(--border-default)] px-2 py-1 text-xs hover:bg-[var(--surface-muted)] md:block"
        >
          {isSidebarCollapsed ? '>' : '<'}
        </button>
      </div>

      {!isSidebarCollapsed ? (
        <label className="mb-2 block">
          <span className="sr-only">Search sessions</span>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search sessions"
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
        </label>
      ) : null}

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleCreateSession()}
          disabled={isCreating}
          className="flex-1 rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSidebarCollapsed ? '+' : isCreating ? 'Creating...' : '+ New chat'}
        </button>

        {!isSidebarCollapsed ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="rounded-md border border-[var(--border-default)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? '...' : 'Refresh'}
          </button>
        ) : null}
      </div>

      {sessionsError ? <p className="mb-2 text-xs text-red-500">{sessionsError}</p> : null}
      {mutationError ? <p className="mb-2 text-xs text-red-500">{mutationError}</p> : null}

      <div className="flex-1 overflow-y-auto">
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          isLoading={isLoading}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          renamingSessionId={renamingSessionId}
          deletingSessionId={deletingSessionId}
          collapsed={isSidebarCollapsed}
          onSelect={(sessionId) => void handleSelectSession(sessionId)}
          onRename={handleOpenRenameDialog}
          onDelete={handleOpenDeleteDialog}
          onLoadMore={() => void fetchNextPage()}
        />
      </div>
    </>
  );

  return (
    <div className="relative flex min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <aside
        className={`hidden h-screen shrink-0 border-r border-[var(--border-default)] bg-[var(--surface-panel)] p-3 md:flex md:flex-col ${sidebarClassName}`}
      >
        {sidebarContent}
      </aside>

      {isMobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-20 bg-black/35 md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-80 border-r border-[var(--border-default)] bg-[var(--surface-panel)] p-3 transition-transform duration-200 md:hidden ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Sessions</p>
          <button
            type="button"
            onClick={closeMobileSidebar}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>

        <label className="mb-2 block">
          <span className="sr-only">Search sessions</span>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search sessions"
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
        </label>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => void handleCreateSession()}
            disabled={isCreating}
            className="flex-1 rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-left text-sm"
          >
            {isCreating ? 'Creating...' : '+ New chat'}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="rounded-md border border-[var(--border-default)] px-3 py-2 text-xs"
          >
            {isRefreshing ? '...' : 'Refresh'}
          </button>
        </div>

        {sessionsError ? <p className="mb-2 text-xs text-red-500">{sessionsError}</p> : null}
        {mutationError ? <p className="mb-2 text-xs text-red-500">{mutationError}</p> : null}

        <div className="flex-1 overflow-y-auto">
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={isLoading}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            renamingSessionId={renamingSessionId}
            deletingSessionId={deletingSessionId}
            collapsed={false}
            onSelect={(sessionId) => void handleSelectSession(sessionId)}
            onRename={handleOpenRenameDialog}
            onDelete={handleOpenDeleteDialog}
            onLoadMore={() => void fetchNextPage()}
          />
        </div>
      </aside>

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-4">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs md:hidden"
          >
            Menu
          </button>

          <h1 className="text-sm font-semibold">LLM Chat App</h1>
          <p className="hidden truncate text-xs text-[var(--text-muted)] sm:block">
            {activeSessionName}
          </p>

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStopStream}
              className="ml-auto rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs text-red-600 hover:bg-red-500/20"
            >
              Stop
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
            >
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
            <button
              type="button"
              onClick={() => openSettings('general')}
              className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
            >
              Settings
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              {activeSession ? (
                <MessageThread
                  messages={activeMessages}
                  isStreaming={isStreaming}
                  onRegenerate={(node) => void handleRegenerate(node)}
                />
              ) : (
                <div className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-8 text-center text-sm text-[var(--text-muted)]">
                  Create or select a session from the sidebar to start chatting.
                </div>
              )}

              {streamPreviewText.length > 0 ? (
                <div className="mx-auto mt-3 w-full max-w-3xl rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-3">
                  <p className="mb-1 text-xs text-[var(--text-muted)]">Assistant (streaming)</p>
                  <p className="whitespace-pre-wrap text-sm leading-6">{streamPreviewText}</p>
                </div>
              ) : null}

              {activePendingPrompts.length > 0 ? (
                <div className="mx-auto mt-3 w-full max-w-3xl space-y-2">
                  {activePendingPrompts.map((pending) => (
                    <div
                      key={pending.id}
                      className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2 text-xs"
                    >
                      <p className="text-[var(--text-muted)]">
                        {pending.status === 'pending' ? 'Pending prompt' : 'Failed prompt'}
                      </p>
                      <p className="truncate">{pending.prompt}</p>
                      {pending.error ? <p className="mt-1 text-red-500">{pending.error}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {activeChatError ? (
                <p className="mx-auto mt-3 w-full max-w-3xl text-sm text-red-500">
                  {activeChatError}
                </p>
              ) : null}
            </div>

            <footer className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
              <div className="mx-auto w-full max-w-3xl">
                <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <p>
                    Model:{' '}
                    {resolvedApi && resolvedModelId
                      ? `${resolvedApi}/${resolvedModelId}`
                      : 'Not selected'}
                  </p>
                  {!hasModelSelection ? (
                    <p className="text-amber-500">Select provider/model in Settings</p>
                  ) : null}
                </div>

                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={composerDraft}
                    onChange={(event) => {
                      setComposerError(null);
                      setComposerDraft({
                        session: activeSession ?? undefined,
                        draft: event.target.value,
                      });
                    }}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Type a message..."
                    className="max-h-36 min-h-11 flex-1 resize-y rounded-lg border border-[var(--border-default)] bg-[var(--surface-canvas)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                  />

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStopStream}
                      className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-600 hover:bg-red-500/10"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!composerDraft.trim() || !hasModelSelection}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                  )}
                </div>

                {composerError ? (
                  <p className="mt-2 text-xs text-red-500">{composerError}</p>
                ) : null}
                {providersError ? (
                  <p className="mt-2 text-xs text-red-500">{providersError}</p>
                ) : null}
              </div>
            </footer>
          </section>
        </main>
      </div>

      {isSettingsOpen ? (
        <button
          type="button"
          aria-label="Close settings"
          onClick={closeSettings}
          className="fixed inset-0 z-20 bg-black/20"
        />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-30 flex h-screen w-[320px] flex-col border-l border-[var(--border-default)] bg-[var(--surface-panel)] transition-transform duration-200 ${
          isSettingsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--border-default)] px-3 py-2">
          {(['general', 'model', 'keys'] as const).map((tab) => {
            const selected = activeSettingsTab === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveSettingsTab(tab)}
                className={`rounded-md px-3 py-1.5 text-xs capitalize ${
                  selected
                    ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-canvas)]'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-4 text-sm">
          {activeSettingsTab === 'general' ? (
            <>
              <p className="font-medium">General</p>
              <p className="text-[var(--text-muted)]">
                Theme, defaults, and session preferences will live here.
              </p>
            </>
          ) : null}

          {activeSettingsTab === 'model' ? (
            <>
              <p className="font-medium">Model</p>
              <p className="text-[var(--text-muted)]">
                Provider and model selection UI will be connected next.
              </p>
            </>
          ) : null}

          {activeSettingsTab === 'keys' ? (
            <>
              <p className="font-medium">API Keys</p>
              <p className="text-[var(--text-muted)]">
                Per-provider key management panel goes here.
              </p>
            </>
          ) : null}
        </div>
      </aside>

      {renameSessionId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
            <h3 className="mb-2 text-sm font-semibold">Rename session</h3>
            <input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              className="mb-3 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Session name"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRenameSessionDialog}
                className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitRename()}
                disabled={!renameDraft.trim() || renamingSessionId === renameSessionId}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {renamingSessionId === renameSessionId ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteSessionId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
            <h3 className="mb-2 text-sm font-semibold">Delete session</h3>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              This removes the selected conversation permanently.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteSessionDialog}
                className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deletingSessionId === deleteSessionId}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingSessionId === deleteSessionId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
