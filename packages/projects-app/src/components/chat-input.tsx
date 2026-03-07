'use client';

import { ArrowUp, ChevronDown, File, Plus, Square } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from './prompt-input';

import type { ProjectFileIndexEntry } from '@/lib/client-api';
import type { ReasoningLevel, SessionRef } from '@/lib/contracts';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { generateSessionName } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import {
  useArtifactFilesStore,
  useChatSettingsStore,
  useChatStore,
  useComposerStore,
  useSessionsStore,
  useSidebarStore,
} from '@/stores';
import {
  CHAT_MODEL_OPTIONS,
  getReasoningOptions,
  getSelectedChatModel,
} from '@/stores/chat-settings-store';

const MENTION_SEARCH_LIMIT = 80;
const MENTION_DROPDOWN_LIMIT = 20;
const MENTION_SEARCH_DEBOUNCE_MS = 120;

type ComposerDropdownOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type MentionRange = {
  start: number;
  end: number;
  query: string;
};

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }
  return false;
}

function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? path;
}

function getDirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) return '';
  return normalized.slice(0, idx);
}

function isBoundaryChar(ch: string | undefined): boolean {
  if (!ch) return true;
  return /\s|[([{,]/.test(ch);
}

function extractActiveMention(value: string, caret: number): MentionRange | null {
  const safeCaret = Math.max(0, Math.min(caret, value.length));

  let tokenStart = safeCaret;
  while (tokenStart > 0 && !/\s/.test(value[tokenStart - 1] ?? '')) {
    tokenStart -= 1;
  }

  if (value[tokenStart] !== '@') {
    return null;
  }

  if (!isBoundaryChar(value[tokenStart - 1])) {
    return null;
  }

  let tokenEnd = safeCaret;
  while (tokenEnd < value.length && !/\s/.test(value[tokenEnd] ?? '')) {
    tokenEnd += 1;
  }

  const tokenBody = value.slice(tokenStart + 1, tokenEnd);
  if (/[^a-zA-Z0-9_./-]/.test(tokenBody)) {
    return null;
  }

  const query = value.slice(tokenStart + 1, safeCaret);
  if (/[^a-zA-Z0-9_./-]/.test(query)) {
    return null;
  }

  return {
    start: tokenStart,
    end: tokenEnd,
    query,
  };
}

function scoreFileMatch(entry: ProjectFileIndexEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) {
    return 0;
  }

  const basename = getBasename(entry.path).toLowerCase();
  const filePath = entry.path.toLowerCase();
  const artifactPath = entry.artifactPath.toLowerCase();
  const artifactName = entry.artifactName.toLowerCase();
  let score = 0;

  if (basename === q) {
    score += 1000;
  } else if (basename.startsWith(q)) {
    score += 800;
  } else if (basename.includes(q)) {
    score += 500;
  }

  if (filePath.startsWith(q)) {
    score += 350;
  } else if (filePath.includes(q)) {
    score += 200;
  }

  if (artifactPath.includes(q)) {
    score += 120;
  }

  if (artifactName.includes(q)) {
    score += 90;
  }

  return score;
}

function rankProjectFiles(
  entries: ProjectFileIndexEntry[],
  query: string
): ProjectFileIndexEntry[] {
  return [...entries].sort((a, b) => {
    const scoreDiff = scoreFileMatch(b, query) - scoreFileMatch(a, query);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.artifactPath.localeCompare(b.artifactPath);
  });
}

function mentionsEqual(a: MentionRange | null, b: MentionRange | null): boolean {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.start === b.start && a.end === b.end && a.query === b.query;
}

function replaceMentionToken(
  value: string,
  mention: MentionRange,
  replacement: string
): { value: string; cursor: number } {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.end);
  const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
  const suffix = needsTrailingSpace ? ' ' : '';

  return {
    value: `${before}${replacement}${suffix}${after}`,
    cursor: before.length + replacement.length + suffix.length,
  };
}

function removeMentionBeforeCaret(
  value: string,
  caret: number
): { value: string; cursor: number } | null {
  if (caret <= 0 || caret > value.length) {
    return null;
  }

  const prefix = value.slice(0, caret);
  const trailingWhitespace = prefix.match(/\s+$/)?.[0] ?? '';
  if (trailingWhitespace.length === 0) {
    return null;
  }

  const prefixWithoutWhitespace = prefix.slice(0, prefix.length - trailingWhitespace.length);
  const mentionMatch = prefixWithoutWhitespace.match(/(?:^|\s)(@[^\s]+)$/);
  if (!mentionMatch) {
    return null;
  }

  const mentionToken = mentionMatch[1];
  if (!mentionToken || !/^@[^/\s]+\/[^\s]+$/.test(mentionToken)) {
    return null;
  }

  const tokenStart = prefixWithoutWhitespace.length - mentionToken.length;
  const before = value.slice(0, tokenStart);
  const after = value.slice(caret);
  const normalizedAfter =
    before.endsWith(' ') && after.startsWith(' ') ? after.replace(/^\s+/, ' ') : after;

  return {
    value: `${before}${normalizedAfter}`,
    cursor: tokenStart,
  };
}

function buildFileLabel(entry: ProjectFileIndexEntry): string {
  const dir = getDirname(entry.path);
  return dir.length > 0 ? `${entry.artifactName}/${dir}` : entry.artifactName;
}

function ComposerDropdownControl({
  label,
  value,
  displayValue,
  options,
  onValueChange,
  className,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: readonly ComposerDropdownOption[];
  onValueChange: (nextValue: string) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-home-hover inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md px-2 text-[13px] leading-[1.15] font-medium transition-colors',
            className
          )}
          aria-label={label}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronDown className="size-3.5 opacity-65" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-home-panel border-home-border text-foreground min-w-40 rounded-xl p-1"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="rounded-lg text-[13px] leading-[1.15]"
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  PromptInputWithActions                                            */
/* ------------------------------------------------------------------ */

function PromptInputWithActions() {
  const [localInput, setLocalInput] = useState('');
  const [activeMention, setActiveMention] = useState<MentionRange | null>(null);
  const [mentionResults, setMentionResults] = useState<ProjectFileIndexEntry[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const textareaElementRef = useRef<HTMLTextAreaElement | null>(null);
  const activeMentionRef = useRef<MentionRange | null>(null);
  const mentionRequestIdRef = useRef(0);

  const router = useRouter();
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId: string;
    threadId?: string;
  }>();

  const ctx = { projectId, artifactId };

  // Use threadId from URL as the source of truth — the store's activeSession
  // can be stale when navigating between artifacts.
  const currentSession: SessionRef | null = threadId ? { sessionId: threadId } : null;
  const composerInput = useComposerStore((state) => {
    if (!currentSession) {
      return '';
    }

    return state.draftsBySession[currentSession.sessionId] ?? '';
  });
  const setDraft = useComposerStore((state) => state.setDraft);
  const markSubmitted = useComposerStore((state) => state.markSubmitted);

  const startStream = useChatStore((state) => state.startStream);
  const abortStream = useChatStore((state) => state.abortStream);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setActiveSession = useChatStore((state) => state.setActiveSession);

  const isStreaming = useChatStore((state) => {
    if (!currentSession) return false;
    return state.isStreamingBySession[currentSession.sessionId] ?? false;
  });

  const createSession = useSessionsStore((state) => state.createSession);
  const selectedApi = useChatSettingsStore((state) => state.api);
  const selectedModelId = useChatSettingsStore((state) => state.modelId);
  const selectedReasoning = useChatSettingsStore((state) => state.reasoning);
  const setSelectedModel = useChatSettingsStore((state) => state.setModel);
  const setSelectedReasoning = useChatSettingsStore((state) => state.setReasoning);

  const sidebarAddSession = useSidebarStore((state) => state.addSession);
  const sidebarRenameSession = useSidebarStore((state) => state.renameSession);
  const loadProjectFileIndex = useArtifactFilesStore((state) => state.loadProjectFileIndex);
  const searchProjectFiles = useArtifactFilesStore((state) => state.searchProjectFiles);
  const input = currentSession ? composerInput : localInput;

  const isMentionOpen = activeMention !== null;
  const selectedModel = getSelectedChatModel({
    api: selectedApi,
    modelId: selectedModelId,
  });
  const modelOptions = CHAT_MODEL_OPTIONS.map((option) => ({
    value: option.modelId,
    label: option.label,
  }));
  const reasoningOptions = getReasoningOptions({
    api: selectedApi,
    modelId: selectedModelId,
  });
  const selectedReasoningLabel =
    reasoningOptions.find((option) => option.value === selectedReasoning)?.label ?? 'High';

  const setMentionState = (next: MentionRange | null) => {
    if (mentionsEqual(activeMentionRef.current, next)) {
      return;
    }

    activeMentionRef.current = next;
    setActiveMention(next);

    if (!next) {
      setMentionResults([]);
      setMentionError(null);
      setMentionLoading(false);
      setHighlightedMentionIndex(0);
      return;
    }

    setMentionError(null);
    setHighlightedMentionIndex(0);
  };

  const syncActiveMention = (value: string, caret: number | null) => {
    const resolvedCaret = caret ?? value.length;
    const mention = extractActiveMention(value, resolvedCaret);
    setMentionState(mention);
  };

  useEffect(() => {
    void loadProjectFileIndex(projectId).catch(() => {
      // Mention search can still fallback to server query.
    });
  }, [loadProjectFileIndex, projectId]);

  useEffect(() => {
    if (!activeMention) {
      return undefined;
    }

    const currentRequestId = mentionRequestIdRef.current + 1;
    mentionRequestIdRef.current = currentRequestId;

    const runSearch = async () => {
      try {
        setMentionLoading(true);
        setMentionError(null);
        const files = await searchProjectFiles(
          projectId,
          activeMention.query,
          MENTION_SEARCH_LIMIT
        );
        if (mentionRequestIdRef.current !== currentRequestId) {
          return;
        }

        const ranked = rankProjectFiles(files, activeMention.query).slice(
          0,
          MENTION_DROPDOWN_LIMIT
        );
        setMentionResults(ranked);
        setHighlightedMentionIndex((prev) => {
          if (ranked.length === 0) return 0;
          return Math.min(prev, ranked.length - 1);
        });
      } catch (err) {
        if (mentionRequestIdRef.current !== currentRequestId) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to load files.';
        setMentionResults([]);
        setMentionError(message);
      } finally {
        if (mentionRequestIdRef.current === currentRequestId) {
          setMentionLoading(false);
        }
      }
    };

    const debounceMs = activeMention.query.trim().length === 0 ? 0 : MENTION_SEARCH_DEBOUNCE_MS;
    const timeout = window.setTimeout(() => {
      void runSearch();
    }, debounceMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeMention, projectId, searchProjectFiles]);

  const handleInputChange = (nextValue: string) => {
    if (currentSession) {
      setDraft({
        session: currentSession,
        draft: nextValue,
      });
      return;
    }

    setLocalInput(nextValue);
  };

  const handleMentionSelect = (entry: ProjectFileIndexEntry) => {
    if (!activeMention) {
      return;
    }

    const mentionToken = `@${entry.artifactPath}`;
    const nextMentionedValue = replaceMentionToken(input, activeMention, mentionToken);
    handleInputChange(nextMentionedValue.value);
    setMentionState(null);

    window.requestAnimationFrame(() => {
      const textarea = textareaElementRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(nextMentionedValue.cursor, nextMentionedValue.cursor);
    });
  };

  const handleTextareaSelection = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    textareaElementRef.current = textarea;
    syncActiveMention(textarea.value, textarea.selectionStart);
  };

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    textareaElementRef.current = textarea;
    syncActiveMention(textarea.value, textarea.selectionStart);
  };

  const handleTextareaKeyUp = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    textareaElementRef.current = textarea;
    syncActiveMention(textarea.value, textarea.selectionStart);
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const textarea = event.currentTarget;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      if (selectionStart !== null && selectionEnd !== null && selectionStart === selectionEnd) {
        const removal = removeMentionBeforeCaret(textarea.value, selectionStart);
        if (removal) {
          event.preventDefault();
          handleInputChange(removal.value);
          setMentionState(null);
          window.requestAnimationFrame(() => {
            const nextTextarea = textareaElementRef.current;
            if (!nextTextarea) {
              return;
            }
            nextTextarea.focus();
            nextTextarea.setSelectionRange(removal.cursor, removal.cursor);
          });
          return;
        }
      }
    }

    if (!isMentionOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setMentionState(null);
      return;
    }

    if (mentionResults.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedMentionIndex((prev) => (prev + 1) % mentionResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedMentionIndex((prev) =>
        prev === 0 ? mentionResults.length - 1 : Math.max(0, prev - 1)
      );
      return;
    }

    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      const selected = mentionResults[highlightedMentionIndex];
      if (selected) {
        handleMentionSelect(selected);
      }
    }
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (trimmed === '' || isStreaming) return;

    try {
      let session: SessionRef | undefined = currentSession ?? undefined;

      if (!session) {
        const created = await createSession(ctx, {
          sessionName: 'New chat',
          api: selectedApi,
          modelId: selectedModelId,
        });
        const ref: SessionRef = { sessionId: created.sessionId };
        setActiveSession(ref);

        // Optimistically add the new thread to the sidebar immediately
        sidebarAddSession(artifactId, {
          sessionId: created.sessionId,
          sessionName: 'New chat',
          createdAt: new Date().toISOString(),
          updatedAt: null,
          nodeCount: 0,
        });

        router.push(`/${projectId}/${artifactId}/${created.sessionId}`);
        await loadMessages({ session: ref, projectId, artifactId, force: true });
        session = ref;

        void generateSessionName(ctx, {
          sessionId: created.sessionId,
          query: trimmed,
        })
          .then((result) => {
            sidebarRenameSession(created.sessionId, result.sessionName);
          })
          .catch(() => {
            // Naming failed silently — keep "New chat"
          });
      }

      if (!session) {
        throw new Error('Could not create or select a session.');
      }

      if (currentSession) {
        markSubmitted(currentSession);
      } else {
        setLocalInput('');
      }
      setMentionState(null);

      await startStream({
        sessionId: session.sessionId,
        prompt: trimmed,
        projectId,
        artifactId,
        api: selectedApi,
        modelId: selectedModelId,
        reasoningLevel: selectedReasoning,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      const message = err instanceof Error ? err.message : 'Failed to send message.';
      toast.error(message, {
        id: 'composer-error',
      });
    }
  };

  const handleStop = () => {
    if (currentSession) {
      abortStream(currentSession);
    }
  };

  return (
    <PromptInput
      value={input}
      onValueChange={handleInputChange}
      isLoading={isStreaming}
      onSubmit={handleSubmit}
      className="relative w-full max-w-(--breakpoint-md)"
    >
      {isMentionOpen ? (
        <div className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-2xl border border-white/15 bg-black/85 p-1.5 shadow-2xl backdrop-blur-md">
          <div className="max-h-64 overflow-y-auto">
            {mentionLoading ? (
              <p className="text-muted-foreground px-2.5 py-1.5 text-xs">Searching files...</p>
            ) : mentionError ? (
              <p className="px-2.5 py-1.5 text-xs text-red-400">{mentionError}</p>
            ) : mentionResults.length === 0 ? (
              <p className="text-muted-foreground px-2.5 py-1.5 text-xs">No matching files.</p>
            ) : (
              mentionResults.map((entry, index) => (
                <button
                  key={entry.artifactPath}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleMentionSelect(entry);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left',
                    index === highlightedMentionIndex ? 'bg-white/12' : 'hover:bg-white/8'
                  )}
                >
                  <File className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate text-sm font-medium text-white">
                    {getBasename(entry.path)}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {buildFileLabel(entry)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <div className="px-1">
        <PromptInputTextarea
          data-chat-composer-textarea=""
          placeholder="Ask me anything..."
          className="min-h-[30px] px-0 py-2 text-sm"
          onChange={handleTextareaChange}
          onSelect={handleTextareaSelection}
          onClick={handleTextareaSelection}
          onFocus={handleTextareaSelection}
          onKeyUp={handleTextareaKeyUp}
          onKeyDown={handleTextareaKeyDown}
        />
      </div>

      <PromptInputActions className="flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-0.5">
          <PromptInputAction tooltip="Add">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground hover:bg-home-hover inline-flex size-7 items-center justify-center rounded-md transition-colors"
            >
              <Plus className="size-4" />
            </button>
          </PromptInputAction>

          <ComposerDropdownControl
            label="Select model"
            value={selectedModel.modelId}
            displayValue={selectedModel.label}
            options={modelOptions}
            className="w-[110px]"
            onValueChange={setSelectedModel}
          />

          <ComposerDropdownControl
            label="Select reasoning"
            value={selectedReasoning}
            displayValue={selectedReasoningLabel}
            options={reasoningOptions}
            className="w-[94px]"
            onValueChange={(value) => setSelectedReasoning(value as ReasoningLevel)}
          />
        </div>

        <PromptInputAction tooltip={isStreaming ? 'Stop generation' : 'Send message'}>
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 cursor-pointer rounded-full"
            onClick={isStreaming ? handleStop : handleSubmit}
          >
            {isStreaming ? (
              <Square className="size-3 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </PromptInputAction>
      </PromptInputActions>
    </PromptInput>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatInput                                                         */
/* ------------------------------------------------------------------ */

export const ChatInput = () => {
  return (
    <div className="bg-home-page absolute bottom-0 w-full px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start pb-4">
        <PromptInputWithActions />
      </div>
    </div>
  );
};
