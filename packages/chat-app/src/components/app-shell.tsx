'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { SessionRef } from '@/lib/contracts';
import type {
  AgentEvent,
  Api,
  Attachment,
  Content,
  Message,
  MessageNode,
  Model,
  SessionSummary,
} from '@ank1015/llm-sdk';

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
const EMPTY_ATTACHMENTS: Attachment[] = [];
const EMPTY_MODELS: Model<Api>[] = [];
type SettingsScopeMode = 'global' | 'session';
type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

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

function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Could not read file: ${file.name}`));
        return;
      }

      const [, base64 = ''] = reader.result.split(',', 2);
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error(`Could not read file: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

async function toAttachment(file: File): Promise<Attachment> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type.trim() || 'application/octet-stream';

  return {
    id: createAttachmentId(),
    type: mimeType.startsWith('image/') ? 'image' : 'file',
    fileName: file.name || 'file',
    mimeType,
    size: file.size,
    content: base64,
  };
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }

  const mib = kib / 1024;
  return `${mib.toFixed(1)} MB`;
}

function parseProviderOptionsJson(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {};
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!isObjectRecord(parsed)) {
    throw new Error('Provider options must be a JSON object.');
  }

  return parsed;
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
  emptyMessage: string;
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
    emptyMessage,
  } = props;

  if (isLoading && sessions.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`session-skeleton-${index}`}
            className="animate-pulse rounded-md border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-3 py-3"
          >
            <div className="h-3 w-3/4 rounded bg-[var(--surface-muted)]" />
            <div className="mt-2 h-2 w-1/2 rounded bg-[var(--surface-muted)]" />
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return <p className="px-1 text-xs text-[var(--text-muted)]">{emptyMessage}</p>;
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

function MessageThreadSkeleton(): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`message-skeleton-${index}`}
          className={`animate-pulse rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-3 ${
            index % 2 === 0 ? 'mr-auto max-w-[85%]' : 'ml-auto max-w-[75%]'
          }`}
        >
          <div className="h-3 w-16 rounded bg-[var(--surface-muted)]" />
          <div className="mt-3 h-3 w-full rounded bg-[var(--surface-muted)]" />
          <div className="mt-2 h-3 w-2/3 rounded bg-[var(--surface-muted)]" />
        </div>
      ))}
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

  const providers = useProvidersStore((state) => state.providers);
  const modelsByApi = useProvidersStore((state) => state.modelsByApi);
  const selectedApi = useProvidersStore((state) => state.selectedApi);
  const selectedModelId = useProvidersStore((state) => state.selectedModelId);
  const setSelectedApi = useProvidersStore((state) => state.setSelectedApi);
  const setSelectedModelId = useProvidersStore((state) => state.setSelectedModelId);
  const providersError = useProvidersStore((state) => state.error);
  const refreshCatalog = useProvidersStore((state) => state.refreshCatalog);

  const globalSettings = useChatSettingsStore((state) => state.globalSettings);
  const getEffectiveSettings = useChatSettingsStore((state) => state.getEffectiveSettings);
  const setGlobalApi = useChatSettingsStore((state) => state.setGlobalApi);
  const setGlobalModelId = useChatSettingsStore((state) => state.setGlobalModelId);
  const setGlobalSystemPrompt = useChatSettingsStore((state) => state.setGlobalSystemPrompt);
  const setGlobalProviderOptions = useChatSettingsStore((state) => state.setGlobalProviderOptions);
  const setSessionApi = useChatSettingsStore((state) => state.setSessionApi);
  const setSessionModelId = useChatSettingsStore((state) => state.setSessionModelId);
  const setSessionSystemPrompt = useChatSettingsStore((state) => state.setSessionSystemPrompt);
  const setSessionProviderOptions = useChatSettingsStore(
    (state) => state.setSessionProviderOptions
  );

  const composerDraft = useComposerStore((state) => {
    if (!activeSessionKey) {
      return '';
    }

    return state.draftsBySession[activeSessionKey] ?? '';
  });
  const composerAttachments = useComposerStore((state) => {
    if (!activeSessionKey) {
      return EMPTY_ATTACHMENTS;
    }

    return state.attachmentsBySession[activeSessionKey] ?? EMPTY_ATTACHMENTS;
  });
  const setComposerDraft = useComposerStore((state) => state.setDraft);
  const addComposerAttachment = useComposerStore((state) => state.addAttachment);
  const removeComposerAttachment = useComposerStore((state) => state.removeAttachment);
  const clearComposerAttachments = useComposerStore((state) => state.clearAttachments);
  const markComposerSubmitted = useComposerStore((state) => state.markSubmitted);

  const [theme, setTheme] = useState<ThemeMode>('light');
  const [searchInput, setSearchInput] = useState(query);
  const [renameDraft, setRenameDraft] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [settingsScope, setSettingsScope] = useState<SettingsScopeMode>('global');
  const [providerOptionsDraft, setProviderOptionsDraft] = useState('{}');
  const [providerOptionsError, setProviderOptionsError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<number[]>([]);

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

  useEffect(() => {
    if (settingsScope === 'session' && !activeSession) {
      setSettingsScope('global');
    }
  }, [activeSession, settingsScope]);

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
  const isLoadingMessages = useChatStore((state) => {
    if (!activeSessionKey) {
      return false;
    }

    return state.isLoadingMessagesBySession[activeSessionKey] ?? false;
  });

  const effectiveSettings = getEffectiveSettings(activeSession ?? undefined);
  const resolvedApi = effectiveSettings.api ?? selectedApi;
  const resolvedModelId = effectiveSettings.modelId ?? selectedModelId;
  const panelSettings =
    settingsScope === 'session' && activeSession
      ? getEffectiveSettings(activeSession)
      : globalSettings;
  const panelApi = panelSettings.api;
  const panelModelId = panelSettings.modelId;
  const panelModels = panelApi ? (modelsByApi[panelApi] ?? EMPTY_MODELS) : EMPTY_MODELS;
  const canUseSessionScope = Boolean(activeSession);

  useEffect(() => {
    setProviderOptionsDraft(JSON.stringify(panelSettings.providerOptions, null, 2));
    setProviderOptionsError(null);
  }, [panelSettings.providerOptions, settingsScope, activeSessionKey]);

  useEffect(() => {
    return () => {
      for (const timeoutId of toastTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const dismissToast = (toastId: number): void => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  const pushToast = (message: string, tone: ToastTone = 'info'): void => {
    const id = ++toastIdRef.current;
    setToasts((current) => [...current, { id, message, tone }]);

    const timeoutId = window.setTimeout(() => {
      dismissToast(id);
      toastTimeoutsRef.current = toastTimeoutsRef.current.filter((value) => value !== timeoutId);
    }, 3200);

    toastTimeoutsRef.current.push(timeoutId);
  };

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
    } catch (error) {
      if (error instanceof Error) {
        pushToast(error.message, 'error');
      } else {
        pushToast('Failed to load session messages.', 'error');
      }
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
      pushToast('Session created.', 'success');
      return created;
    } catch (error) {
      if (error instanceof Error) {
        pushToast(error.message, 'error');
      } else {
        pushToast('Failed to create session.', 'error');
      }
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
      pushToast('Session renamed.', 'success');
    } catch (error) {
      if (error instanceof Error) {
        pushToast(error.message, 'error');
      } else {
        pushToast('Failed to rename session.', 'error');
      }
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
      pushToast('Session deleted.', 'success');
    } catch (error) {
      if (error instanceof Error) {
        pushToast(error.message, 'error');
      } else {
        pushToast('Failed to delete session.', 'error');
      }
    }
  };

  const handleStreamPrompt = async (
    prompt: string,
    attachments: Attachment[] = []
  ): Promise<void> => {
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
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    markComposerSubmitted(session);
  };

  const handleSend = async (): Promise<void> => {
    try {
      await handleStreamPrompt(composerDraft, composerAttachments);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (error instanceof Error) {
        setComposerError(error.message);
        pushToast(error.message, 'error');
        return;
      }

      setComposerError('Failed to send message.');
      pushToast('Failed to send message.', 'error');
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
        pushToast(error.message, 'error');
        return;
      }

      setComposerError('Failed to regenerate response.');
      pushToast('Failed to regenerate response.', 'error');
    }
  };

  const openAttachmentPicker = (): void => {
    attachmentInputRef.current?.click();
  };

  const handleAttachmentInput = async (
    event: React.ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.currentTarget.value = '';

    if (files.length === 0) {
      return;
    }

    if (!activeSession) {
      setComposerError('Create/select a session before attaching files.');
      return;
    }

    setComposerError(null);
    setIsUploadingAttachments(true);

    try {
      const attachments = await Promise.all(files.map((file) => toAttachment(file)));
      for (const attachment of attachments) {
        addComposerAttachment({
          session: activeSession,
          attachment,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        setComposerError(error.message);
        pushToast(error.message, 'error');
      } else {
        setComposerError('Failed to process attachments.');
        pushToast('Failed to process attachments.', 'error');
      }
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handleRemoveAttachment = (attachmentId: string): void => {
    if (!activeSession) {
      return;
    }

    removeComposerAttachment({
      session: activeSession,
      attachmentId,
    });
  };

  const handleClearAttachments = (): void => {
    if (!activeSession) {
      return;
    }

    clearComposerAttachments(activeSession);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Escape' && isStreaming) {
      event.preventDefault();
      handleStopStream();
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.altKey) {
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
    pushToast('Streaming stopped.', 'info');
  };

  const handleRetryMessages = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }

    try {
      await loadMessages({ session: activeSession, force: true });
      pushToast('Messages reloaded.', 'success');
    } catch (error) {
      if (error instanceof Error) {
        pushToast(error.message, 'error');
      } else {
        pushToast('Failed to reload messages.', 'error');
      }
    }
  };

  const setPanelApi = (api: Api | null): void => {
    if (settingsScope === 'session' && activeSession) {
      setSessionApi(api, activeSession);
    } else {
      setGlobalApi(api);
      setSelectedApi(api);
    }
  };

  const setPanelModelId = (modelId: string | null): void => {
    if (settingsScope === 'session' && activeSession) {
      setSessionModelId(modelId, activeSession);
    } else {
      setGlobalModelId(modelId);
      setSelectedModelId(modelId);
    }
  };

  const handleProviderChange = (api: Api | null): void => {
    setPanelApi(api);

    if (!api) {
      setPanelModelId(null);
      return;
    }

    const models = modelsByApi[api] ?? EMPTY_MODELS;
    const nextModelId = models[0]?.id ?? null;
    setPanelModelId(nextModelId);
  };

  const handleSystemPromptChange = (value: string): void => {
    if (settingsScope === 'session' && activeSession) {
      setSessionSystemPrompt(value, activeSession);
      return;
    }

    setGlobalSystemPrompt(value);
  };

  const applyProviderOptions = (value: string): void => {
    const options = parseProviderOptionsJson(value);

    if (settingsScope === 'session' && activeSession) {
      setSessionProviderOptions(options, activeSession);
      return;
    }

    setGlobalProviderOptions(options);
  };

  const handleApplyProviderOptions = (): void => {
    try {
      applyProviderOptions(providerOptionsDraft);
      setProviderOptionsError(null);
      setProviderOptionsDraft((current) =>
        JSON.stringify(parseProviderOptionsJson(current), null, 2)
      );
      pushToast('Provider options applied.', 'success');
    } catch (error) {
      if (error instanceof Error) {
        setProviderOptionsError(error.message);
        pushToast(error.message, 'error');
      } else {
        setProviderOptionsError('Invalid provider options JSON.');
        pushToast('Invalid provider options JSON.', 'error');
      }
    }
  };

  const handleResetProviderOptions = (): void => {
    try {
      applyProviderOptions('{}');
      setProviderOptionsDraft('{}');
      setProviderOptionsError(null);
      pushToast('Provider options reset.', 'info');
    } catch (error) {
      if (error instanceof Error) {
        setProviderOptionsError(error.message);
        pushToast(error.message, 'error');
      } else {
        setProviderOptionsError('Could not reset provider options.');
        pushToast('Could not reset provider options.', 'error');
      }
    }
  };

  const activeSessionName =
    sessions.find((session) => session.sessionId === activeSessionId)?.sessionName ??
    'No session selected';
  const hasSessionSearch = searchInput.trim().length > 0;
  const sessionsEmptyMessage = hasSessionSearch
    ? `No sessions match "${searchInput.trim()}".`
    : 'No sessions yet. Create a chat to get started.';

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

      {sessionsError ? (
        <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600">
          <p>{sessionsError}</p>
          <button
            type="button"
            onClick={() => void fetchFirstPage()}
            className="mt-2 rounded border border-red-500/40 px-2 py-1 text-[11px] hover:bg-red-500/15"
          >
            Retry
          </button>
        </div>
      ) : null}
      {mutationError ? (
        <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600">
          {mutationError}
        </div>
      ) : null}

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
          emptyMessage={sessionsEmptyMessage}
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

        {sessionsError ? (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600">
            <p>{sessionsError}</p>
            <button
              type="button"
              onClick={() => void fetchFirstPage()}
              className="mt-2 rounded border border-red-500/40 px-2 py-1 text-[11px] hover:bg-red-500/15"
            >
              Retry
            </button>
          </div>
        ) : null}
        {mutationError ? (
          <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-600">
            {mutationError}
          </div>
        ) : null}

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
            emptyMessage={sessionsEmptyMessage}
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
                isLoadingMessages ? (
                  <MessageThreadSkeleton />
                ) : (
                  <MessageThread
                    messages={activeMessages}
                    isStreaming={isStreaming}
                    onRegenerate={(node) => void handleRegenerate(node)}
                  />
                )
              ) : (
                <div className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-panel)] p-8 text-center text-sm text-[var(--text-muted)]">
                  <p className="font-medium text-[var(--text-primary)]">No active chat</p>
                  <p className="mt-2">
                    Create or select a session from the sidebar to start chatting.
                  </p>
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
                <div className="mx-auto mt-3 w-full max-w-3xl rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600">
                  <p>{activeChatError}</p>
                  <button
                    type="button"
                    onClick={() => void handleRetryMessages()}
                    className="mt-2 rounded border border-red-500/40 px-2 py-1 text-xs hover:bg-red-500/15"
                  >
                    Retry loading messages
                  </button>
                </div>
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

                {composerAttachments.length > 0 ? (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {composerAttachments.map((attachment) => (
                      <span
                        key={attachment.id}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2 py-1 text-xs"
                      >
                        <span className="truncate max-w-48" title={attachment.fileName}>
                          {attachment.fileName}
                        </span>
                        {attachment.size ? (
                          <span className="text-[var(--text-muted)]">
                            ({formatBytes(attachment.size)})
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          className="rounded px-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                          aria-label={`Remove ${attachment.fileName}`}
                        >
                          x
                        </button>
                      </span>
                    ))}

                    <button
                      type="button"
                      onClick={handleClearAttachments}
                      className="rounded border border-[var(--border-default)] px-2 py-1 text-xs hover:bg-[var(--surface-muted)]"
                    >
                      Clear attachments
                    </button>
                  </div>
                ) : null}

                <div className="flex items-end gap-2">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => void handleAttachmentInput(event)}
                  />

                  <button
                    type="button"
                    onClick={openAttachmentPicker}
                    disabled={!activeSession || isUploadingAttachments || isStreaming}
                    className="rounded-lg border border-[var(--border-default)] px-3 py-2 text-xs hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUploadingAttachments ? 'Adding...' : 'Attach'}
                  </button>

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
                    placeholder={
                      activeSession ? 'Type a message...' : 'Select a session to start typing'
                    }
                    disabled={!activeSession}
                    className="max-h-36 min-h-11 flex-1 resize-y rounded-lg border border-[var(--border-default)] bg-[var(--surface-canvas)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
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
                      disabled={!activeSession || !composerDraft.trim() || !hasModelSelection}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Send
                    </button>
                  )}
                </div>

                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  Enter sends, Shift+Enter adds newline, Esc stops streaming.
                </p>

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
                Choose whether model settings apply globally or only to the active session.
              </p>

              <div className="space-y-2 rounded-lg border border-[var(--border-default)] p-3">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="settings-scope"
                    checked={settingsScope === 'global'}
                    onChange={() => setSettingsScope('global')}
                  />
                  Apply settings globally
                </label>

                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name="settings-scope"
                    checked={settingsScope === 'session'}
                    onChange={() => setSettingsScope('session')}
                    disabled={!canUseSessionScope}
                  />
                  Apply to current session only
                </label>

                <p className="text-xs text-[var(--text-muted)]">
                  {settingsScope === 'session'
                    ? activeSession
                      ? `Session: ${activeSession.sessionId}`
                      : 'Select a session to use session-level settings.'
                    : 'Global defaults are used for new chats and sessions without overrides.'}
                </p>
              </div>
            </>
          ) : null}

          {activeSettingsTab === 'model' ? (
            <>
              <p className="font-medium">Model</p>
              <p className="text-[var(--text-muted)]">
                Scope: {settingsScope === 'session' ? 'Session override' : 'Global default'}
              </p>

              <label className="block">
                <span className="mb-1 block text-xs text-[var(--text-muted)]">Provider</span>
                <select
                  value={panelApi ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    handleProviderChange(nextValue ? (nextValue as Api) : null);
                  }}
                  className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Select provider</option>
                  {providers.map((provider) => (
                    <option key={provider.api} value={provider.api}>
                      {provider.api} {provider.hasKey ? '' : '(no key)'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[var(--text-muted)]">Model</span>
                <select
                  value={panelModelId ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    setPanelModelId(nextValue || null);
                  }}
                  disabled={!panelApi}
                  className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select model</option>
                  {panelModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[var(--text-muted)]">System prompt</span>
                <textarea
                  rows={4}
                  value={panelSettings.systemPrompt}
                  onChange={(event) => handleSystemPromptChange(event.target.value)}
                  placeholder="Optional instructions for the assistant..."
                  className="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-[var(--text-muted)]">
                  Provider options (JSON)
                </span>
                <textarea
                  rows={8}
                  value={providerOptionsDraft}
                  onChange={(event) => {
                    setProviderOptionsDraft(event.target.value);
                    setProviderOptionsError(null);
                  }}
                  spellCheck={false}
                  className="w-full resize-y rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2.5 py-2 font-mono text-xs outline-none focus:border-[var(--accent)]"
                />
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyProviderOptions}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white"
                >
                  Apply JSON
                </button>
                <button
                  type="button"
                  onClick={handleResetProviderOptions}
                  className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs"
                >
                  Reset
                </button>
              </div>

              {providerOptionsError ? (
                <p className="text-xs text-red-500">{providerOptionsError}</p>
              ) : null}
            </>
          ) : null}

          {activeSettingsTab === 'keys' ? (
            <>
              <p className="font-medium">API Keys</p>
              <p className="text-[var(--text-muted)]">
                Key status by provider (management UI can be added next).
              </p>

              <div className="space-y-2">
                {providers.map((provider) => (
                  <div
                    key={provider.api}
                    className="flex items-center justify-between rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-3 py-2 text-xs"
                  >
                    <span>{provider.api}</span>
                    <span className={provider.hasKey ? 'text-emerald-500' : 'text-amber-500'}>
                      {provider.hasKey ? 'Key set' : 'Missing key'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </aside>

      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-sm ${
                toast.tone === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                  : toast.tone === 'error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-700'
                    : 'border-[var(--border-default)] bg-[var(--surface-panel)] text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-5">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="rounded px-1 text-[11px] hover:bg-black/10"
                  aria-label="Dismiss toast"
                >
                  x
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

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
