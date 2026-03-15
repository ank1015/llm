import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  extractActiveMention,
  getRelativeMentionPath,
  removeMentionBeforeCaret,
  replaceMentionToken,
  type MentionRange,
} from './project-prompt-composer-utils';
import { ProjectPromptInputShell } from './project-prompt-input-shell';
import { ProjectPromptMentionList } from './project-prompt-mention-list';

import type { ProjectFileIndexEntry, ReasoningLevel, SessionRef } from '@/lib/client-api';
import type {
  LayoutChangeEvent,
  NativeSyntheticEvent,
  TextInput,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
} from 'react-native';

import { generateSessionName } from '@/lib/client-api';
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
import { appLayout, appSpacing } from '@/styles/ui';

const MENTION_SEARCH_LIMIT = 80;
const MENTION_DROPDOWN_LIMIT = 20;
const MENTION_SEARCH_DEBOUNCE_MS = 120;

type ProjectPromptComposerProps = {
  artifactId: string;
  onHeightChange: (height: number) => void;
  projectId: string;
  threadId?: string;
  visible: boolean;
};

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }

  return false;
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

function getNextCaret(
  previousValue: string,
  nextValue: string,
  selection: { start: number; end: number }
): number {
  const replacedLength = Math.max(0, selection.end - selection.start);
  const insertedLength = nextValue.length - (previousValue.length - replacedLength);
  const nextCaret = selection.start + insertedLength;

  return Math.max(0, Math.min(nextCaret, nextValue.length));
}

export function ProjectPromptComposer({
  artifactId,
  onHeightChange,
  projectId,
  threadId,
  visible,
}: ProjectPromptComposerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const activeMentionRef = useRef<MentionRange | null>(null);
  const inputValueRef = useRef('');
  const lastKeyPressRef = useRef<string | null>(null);
  const mentionRequestIdRef = useRef(0);
  const pendingSelectionFrameRef = useRef<number | null>(null);
  const pendingSelectionReleaseFrameRef = useRef<number | null>(null);
  const previousThreadIdRef = useRef<string | undefined>(undefined);
  const selectionRef = useRef({ start: 0, end: 0 });
  const currentSession = useMemo<SessionRef | null>(
    () => (threadId ? { sessionId: threadId } : null),
    [threadId]
  );

  const artifactName = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId)?.name ?? null
  );

  const composerInput = useComposerStore((state) =>
    threadId ? (state.draftsBySession[threadId] ?? '') : ''
  );
  const focusRequestToken = useComposerStore((state) =>
    threadId ? (state.focusRequestTokenBySession[threadId] ?? 0) : 0
  );
  const editState = useComposerStore((state) =>
    threadId ? (state.editStateBySession[threadId] ?? null) : null
  );
  const setDraft = useComposerStore((state) => state.setDraft);
  const clearAttachments = useComposerStore((state) => state.clearAttachments);
  const clearEditState = useComposerStore((state) => state.clearEditState);
  const cancelEdit = useComposerStore((state) => state.cancelEdit);
  const markSubmitted = useComposerStore((state) => state.markSubmitted);

  const startStream = useChatStore((state) => state.startStream);
  const editFromNode = useChatStore((state) => state.editFromNode);
  const abortStream = useChatStore((state) => state.abortStream);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const isStreaming = useChatStore((state) =>
    threadId ? (state.isStreamingBySession[threadId] ?? false) : false
  );

  const createSession = useSessionsStore((state) => state.createSession);
  const sidebarAddSession = useSidebarStore((state) => state.addSession);
  const sidebarRenameSession = useSidebarStore((state) => state.renameSession);

  const selectedApi = useChatSettingsStore((state) => state.api);
  const selectedModelId = useChatSettingsStore((state) => state.modelId);
  const selectedReasoning = useChatSettingsStore((state) => state.reasoning);
  const setSelectedModel = useChatSettingsStore((state) => state.setModel);
  const setSelectedReasoning = useChatSettingsStore((state) => state.setReasoning);

  const loadProjectFileIndex = useArtifactFilesStore((state) => state.loadProjectFileIndex);
  const searchProjectFiles = useArtifactFilesStore((state) => state.searchProjectFiles);

  const [localInput, setLocalInput] = useState('');
  const [activeMention, setActiveMention] = useState<MentionRange | null>(null);
  const [mentionResults, setMentionResults] = useState<ProjectFileIndexEntry[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    start: number;
    end: number;
  }>();

  const input = currentSession ? composerInput : localInput;
  const isEditing = currentSession !== null && editState !== null;
  const dockBottomPadding = Math.max(insets.bottom - appSpacing.xs, appSpacing.xxs);

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

  const ctx = useMemo(
    () => ({
      artifactId,
      projectId,
    }),
    [artifactId, projectId]
  );

  const updateInput = (nextValue: string) => {
    inputValueRef.current = nextValue;

    if (currentSession) {
      setDraft({
        draft: nextValue,
        session: currentSession,
      });
      return;
    }

    setLocalInput(nextValue);
  };

  const cancelPendingSelectionRelease = useCallback(() => {
    if (pendingSelectionFrameRef.current !== null) {
      cancelAnimationFrame(pendingSelectionFrameRef.current);
      pendingSelectionFrameRef.current = null;
    }

    if (pendingSelectionReleaseFrameRef.current !== null) {
      cancelAnimationFrame(pendingSelectionReleaseFrameRef.current);
      pendingSelectionReleaseFrameRef.current = null;
    }
  }, []);

  const clearPendingSelection = useCallback(() => {
    cancelPendingSelectionRelease();
    setPendingSelection(undefined);
  }, [cancelPendingSelectionRelease]);

  const setTransientSelection = useCallback(
    (nextSelection: { start: number; end: number }) => {
      cancelPendingSelectionRelease();
      selectionRef.current = nextSelection;
      setPendingSelection(nextSelection);

      pendingSelectionFrameRef.current = requestAnimationFrame(() => {
        pendingSelectionFrameRef.current = null;
        pendingSelectionReleaseFrameRef.current = requestAnimationFrame(() => {
          pendingSelectionReleaseFrameRef.current = null;
          setPendingSelection((current) => {
            if (
              current &&
              current.start === nextSelection.start &&
              current.end === nextSelection.end
            ) {
              return undefined;
            }

            return current;
          });
        });
      });
    },
    [cancelPendingSelectionRelease]
  );

  const setMentionState = useCallback((next: MentionRange | null) => {
    if (mentionsEqual(activeMentionRef.current, next)) {
      return;
    }

    activeMentionRef.current = next;
    setActiveMention(next);

    if (!next) {
      mentionRequestIdRef.current += 1;
      setMentionResults([]);
      setMentionError(null);
      setMentionLoading(false);
      return;
    }

    setMentionError(null);
  }, []);

  useEffect(() => {
    void loadProjectFileIndex(projectId).catch(() => {
      // Mention search can fall back to server-side queries.
    });
  }, [loadProjectFileIndex, projectId]);

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  useEffect(() => {
    return () => {
      cancelPendingSelectionRelease();
    };
  }, [cancelPendingSelectionRelease]);

  useEffect(() => {
    if (!visible) {
      setMentionState(null);
      lastKeyPressRef.current = null;
      clearPendingSelection();
      onHeightChange(0);
    }
  }, [clearPendingSelection, onHeightChange, setMentionState, visible]);

  useEffect(() => {
    if (!visible || !currentSession || focusRequestToken === 0) {
      return;
    }

    const nextSelection = {
      start: input.length,
      end: input.length,
    };
    setTransientSelection(nextSelection);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [currentSession, focusRequestToken, input.length, setTransientSelection, visible]);

  useEffect(() => {
    if (!threadId) {
      previousThreadIdRef.current = undefined;
      return;
    }

    if (previousThreadIdRef.current === threadId) {
      return;
    }

    previousThreadIdRef.current = threadId;
    const nextSelection = {
      start: composerInput.length,
      end: composerInput.length,
    };
    setTransientSelection(nextSelection);
    lastKeyPressRef.current = null;
    setMentionState(null);
  }, [composerInput.length, setMentionState, setTransientSelection, threadId]);

  useEffect(() => {
    if (!activeMention || !visible) {
      return undefined;
    }

    const requestId = mentionRequestIdRef.current + 1;
    mentionRequestIdRef.current = requestId;

    const timeout = setTimeout(
      () => {
        void (async () => {
          try {
            setMentionLoading(true);
            setMentionError(null);

            const files = await searchProjectFiles(
              projectId,
              activeMention.query,
              MENTION_SEARCH_LIMIT
            );

            if (mentionRequestIdRef.current !== requestId) {
              return;
            }

            setMentionResults(files.slice(0, MENTION_DROPDOWN_LIMIT));
          } catch (error) {
            if (mentionRequestIdRef.current !== requestId) {
              return;
            }

            setMentionResults([]);
            setMentionError(error instanceof Error ? error.message : 'Failed to load files.');
          } finally {
            if (mentionRequestIdRef.current === requestId) {
              setMentionLoading(false);
            }
          }
        })();
      },
      activeMention.query.trim().length === 0 ? 0 : MENTION_SEARCH_DEBOUNCE_MS
    );

    return () => {
      clearTimeout(timeout);
    };
  }, [activeMention, projectId, searchProjectFiles, visible]);

  const syncActiveMention = (value: string, caret: number | null) => {
    const resolvedCaret = caret ?? value.length;
    setMentionState(extractActiveMention(value, resolvedCaret));
  };

  const handleInputChange = (nextValue: string) => {
    const previousValue = inputValueRef.current;
    const previousSelection = selectionRef.current;
    const lastKeyPress = lastKeyPressRef.current;
    lastKeyPressRef.current = null;
    clearPendingSelection();

    if (lastKeyPress === 'Backspace' && previousSelection.start === previousSelection.end) {
      const removal = removeMentionBeforeCaret(previousValue, previousSelection.start);
      if (removal) {
        updateInput(removal.value);
        const nextSelection = {
          start: removal.cursor,
          end: removal.cursor,
        };
        setTransientSelection(nextSelection);
        setMentionState(null);
        return;
      }
    }

    updateInput(nextValue);

    const nextCaret = getNextCaret(previousValue, nextValue, previousSelection);
    selectionRef.current = {
      start: nextCaret,
      end: nextCaret,
    };
    syncActiveMention(nextValue, nextCaret);
  };

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ) => {
    const nextSelection = event.nativeEvent.selection;
    selectionRef.current = nextSelection;
    if (pendingSelection) {
      clearPendingSelection();
    }
    lastKeyPressRef.current = null;
    syncActiveMention(inputValueRef.current, nextSelection.start);
  };

  const handleKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    lastKeyPressRef.current = event.nativeEvent.key;
  };

  const handleMentionSelect = (entry: ProjectFileIndexEntry) => {
    const mention = activeMentionRef.current;
    if (!mention) {
      return;
    }

    const mentionToken = `@${getRelativeMentionPath(artifactId, entry)}`;
    const nextValue = replaceMentionToken(inputValueRef.current, mention, mentionToken);

    updateInput(nextValue.value);

    const nextSelection = {
      start: nextValue.cursor,
      end: nextValue.cursor,
    };
    setTransientSelection(nextSelection);
    lastKeyPressRef.current = null;
    setMentionState(null);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (trimmed.length === 0 || isStreaming) {
      return;
    }

    try {
      if (currentSession && editState) {
        setDraft({
          draft: '',
          session: currentSession,
        });
        clearAttachments(currentSession);
        inputValueRef.current = '';
        setMentionState(null);

        await editFromNode({
          api: selectedApi,
          artifactId,
          modelId: selectedModelId,
          nodeId: editState.targetNodeId,
          projectId,
          prompt: trimmed,
          reasoningLevel: selectedReasoning,
          sessionId: currentSession.sessionId,
        });

        clearEditState(currentSession);
        return;
      }

      let session = currentSession ?? undefined;

      if (!session) {
        const created = await createSession(ctx, {
          api: selectedApi,
          modelId: selectedModelId,
          sessionName: 'New chat',
        });

        const createdSession: SessionRef = { sessionId: created.sessionId };
        setActiveSession(createdSession);
        sidebarAddSession(artifactId, {
          createdAt: new Date().toISOString(),
          nodeCount: 0,
          sessionId: created.sessionId,
          sessionName: 'New chat',
          updatedAt: null,
        });

        router.push({
          params: {
            artifactId,
            projectId,
            threadId: created.sessionId,
          },
          pathname: '/[projectId]/[artifactId]/[threadId]',
        });

        await loadMessages({
          artifactId,
          force: true,
          projectId,
          session: createdSession,
        });

        session = createdSession;

        void generateSessionName(ctx, {
          query: trimmed,
          sessionId: created.sessionId,
        })
          .then((result) => {
            sidebarRenameSession(created.sessionId, result.sessionName);
          })
          .catch(() => {
            // Keep the optimistic name if generation fails.
          });
      }

      if (!session) {
        throw new Error('Could not create or select a session.');
      }

      if (currentSession) {
        markSubmitted(currentSession);
      } else {
        updateInput('');
      }

      setMentionState(null);
      selectionRef.current = { start: 0, end: 0 };
      clearPendingSelection();
      lastKeyPressRef.current = null;

      await startStream({
        api: selectedApi,
        artifactId,
        modelId: selectedModelId,
        projectId,
        prompt: trimmed,
        reasoningLevel: selectedReasoning,
        sessionId: session.sessionId,
      });
    } catch (error) {
      if (currentSession && editState) {
        if (isAbortError(error)) {
          clearEditState(currentSession);
          return;
        }

        setDraft({
          draft: trimmed,
          session: currentSession,
        });
      }

      if (isAbortError(error)) {
        return;
      }

      toast.show({
        variant: 'danger',
        label: 'Send failed',
        description: error instanceof Error ? error.message : 'Failed to send message.',
      });
    }
  };

  const handleStop = () => {
    if (!currentSession) {
      return;
    }

    void abortStream({
      artifactId,
      projectId,
      session: currentSession,
    }).catch((error) => {
      if (isAbortError(error)) {
        return;
      }

      toast.show({
        variant: 'danger',
        label: 'Stop failed',
        description: error instanceof Error ? error.message : 'Failed to stop generation.',
      });
    });
  };

  const handleCancelEdit = () => {
    if (!currentSession || isStreaming) {
      return;
    }

    cancelEdit(currentSession);
    setMentionState(null);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    if (!visible) {
      return;
    }

    onHeightChange(Math.ceil(event.nativeEvent.layout.height));
  };

  return (
    <KeyboardStickyView
      enabled={visible}
      offset={{
        closed: 10,
        opened: 36 - dockBottomPadding,
      }}
      pointerEvents={visible ? 'box-none' : 'none'}
      style={{
        bottom: 0,
        display: visible ? 'flex' : 'none',
        left: 0,
        paddingBottom: dockBottomPadding,
        paddingHorizontal: appSpacing.screenHorizontalPadding,
        position: 'absolute',
        right: 0,
        zIndex: 20,
      }}
      onLayout={handleLayout}
    >
      <View className={appLayout.composerDock}>
        {visible && activeMention ? (
          <View
            style={{
              bottom: '100%',
              left: 0,
              marginBottom: appSpacing.sm,
              position: 'absolute',
              right: 0,
            }}
          >
            <ProjectPromptMentionList
              error={mentionError}
              isLoading={mentionLoading}
              onSelect={handleMentionSelect}
              results={mentionResults}
            />
          </View>
        ) : null}

        <ProjectPromptInputShell
          inputRef={inputRef}
          isEditing={isEditing}
          isStreaming={isStreaming}
          isSubmitDisabled={input.trim().length === 0}
          modelLabel={selectedModel.label}
          modelOptions={modelOptions}
          modelValue={selectedModel.modelId}
          onCancelEdit={handleCancelEdit}
          onChangeText={handleInputChange}
          onKeyPress={handleKeyPress}
          onModelChange={setSelectedModel}
          onSelectionChange={handleSelectionChange}
          onStop={handleStop}
          onSubmit={handleSubmit}
          onThinkingChange={(value) => {
            setSelectedReasoning(value as ReasoningLevel);
          }}
          placeholder={artifactName ? `Message ${artifactName}` : 'Message artifact'}
          selection={pendingSelection}
          thinkingLabel={selectedReasoningLabel}
          thinkingOptions={reasoningOptions}
          thinkingValue={selectedReasoning}
          value={input}
        />
      </View>
    </KeyboardStickyView>
  );
}
