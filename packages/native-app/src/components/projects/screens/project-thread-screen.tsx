import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Skeleton, cn, useThemeColor } from 'heroui-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

import type { MessageNode } from '@ank1015/llm-sdk';

import { AppText } from '@/components/app-text';
import { ProjectPromptComposer } from '@/components/projects/composer/project-prompt-composer';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ThreadMessages } from '@/components/projects/thread/thread-messages';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useChatStore, useSidebarStore } from '@/stores';
import { appSpacing } from '@/styles/ui';

const darkBorderClassName = 'border-zinc-900';
const surfaceCardClassName = 'border border-zinc-200 shadow-none';
const EMPTY_MESSAGE_NODES: MessageNode[] = [];
const THREAD_SKELETON_WIDTHS = ['w-[82%]', 'w-[68%]', 'w-[74%]', 'w-[58%]'] as const;

function getStreamingContentLength(streamingAssistant: unknown): number {
  if (!streamingAssistant) {
    return 0;
  }

  try {
    return JSON.stringify(streamingAssistant).length;
  } catch {
    return 1;
  }
}

function ThreadLoadingSkeleton() {
  return (
    <View className="gap-6">
      <View className="w-full items-end gap-2">
        <View className="w-full items-end">
          <Skeleton className="h-16 w-[78%] rounded-[24px]" />
        </View>
        <View className="mr-1 flex-row items-center gap-1">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </View>
      </View>

      <View className="w-full items-start gap-3">
        <View className="max-w-[94%] gap-3">
          <Skeleton className="h-11 w-[56%] rounded-[18px]" />
          <Skeleton className="h-5 w-[88%] rounded-md" />
          <Skeleton className="h-5 w-[72%] rounded-md" />
          <Skeleton className="h-5 w-[80%] rounded-md" />
        </View>
        <View className="ml-1 flex-row items-center gap-1">
          <Skeleton className="h-7 w-7 rounded-full" />
        </View>
      </View>

      <View className="w-full items-end gap-2">
        <View className="w-full items-end">
          <Skeleton className="h-14 w-[64%] rounded-[24px]" />
        </View>
      </View>

      <View className="w-full items-start gap-3">
        <View className="max-w-[94%] gap-3">
          {THREAD_SKELETON_WIDTHS.map((widthClassName, index) => (
            <Skeleton
              key={`thread-loading-line-${index}`}
              className={`h-5 rounded-md ${widthClassName}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function ProjectThreadScreen() {
  const params = useLocalSearchParams<{
    artifactId?: string | string[];
    threadId?: string | string[];
  }>();
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  const threadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId) ?? null
  );
  const session = artifact?.sessions.find((entry) => entry.sessionId === threadId) ?? null;
  const isLoadingOverview = useSidebarStore((state) => state.isLoading);
  const sidebarError = useSidebarStore((state) => state.error);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const threadMessages = useChatStore((state) =>
    threadId ? (state.messagesBySession[threadId] ?? EMPTY_MESSAGE_NODES) : EMPTY_MESSAGE_NODES
  );
  const messageTree = useChatStore((state) =>
    threadId ? (state.messageTreesBySession[threadId] ?? EMPTY_MESSAGE_NODES) : EMPTY_MESSAGE_NODES
  );
  const isThreadLoading = useChatStore((state) =>
    threadId ? (state.isLoadingMessagesBySession[threadId] ?? false) : false
  );
  const isThreadStreaming = useChatStore((state) =>
    threadId ? (state.isStreamingBySession[threadId] ?? false) : false
  );
  const threadError = useChatStore((state) =>
    threadId ? (state.errorsBySession[threadId] ?? null) : null
  );
  const streamingAssistant = useChatStore((state) =>
    threadId ? (state.streamingAssistantBySession[threadId] ?? null) : null
  );
  const visibleLeafNodeId = useChatStore((state) =>
    threadId ? (state.visibleLeafNodeIdBySession[threadId] ?? null) : null
  );
  const { projectId, refreshOverview } = useProjectShell();
  const { isDark } = useAppTheme();
  const [mutedColor] = useThemeColor(['muted']);
  const { height: windowHeight } = useWindowDimensions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasCompletedInitialScrollRef = useRef(false);
  const pendingScrollModeRef = useRef<'append' | 'initial' | null>(null);
  const lastContentKeyRef = useRef('');
  const lastComposerReserveHeightRef = useRef(0);

  useEffect(() => {
    hasCompletedInitialScrollRef.current = false;
    pendingScrollModeRef.current = null;
    shouldStickToBottomRef.current = true;
    lastContentKeyRef.current = '';
    lastComposerReserveHeightRef.current = 0;
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !artifactId) {
      return;
    }

    const activeSession = { sessionId: threadId };
    setActiveSession(activeSession);
    void loadMessages({
      artifactId,
      force: true,
      projectId,
      session: activeSession,
    });
  }, [artifactId, loadMessages, projectId, setActiveSession, threadId]);

  const flushPendingScroll = useCallback(() => {
    const mode = pendingScrollModeRef.current;
    if (!mode) {
      return;
    }

    pendingScrollModeRef.current = null;
    if (mode === 'initial') {
      hasCompletedInitialScrollRef.current = true;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({
        animated: mode === 'append',
      });
    });
  }, []);

  const requestScrollToBottom = useCallback(
    (mode: 'append' | 'initial') => {
      if (pendingScrollModeRef.current === 'initial') {
        return;
      }

      pendingScrollModeRef.current = mode;
      requestAnimationFrame(() => {
        flushPendingScroll();
      });
    },
    [flushPendingScroll]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldStickToBottomRef.current = distanceFromBottom <= 140;
  }, []);

  const hasRenderableContent = threadMessages.length > 0 || Boolean(streamingAssistant);
  const contentKey = useMemo(
    () =>
      [
        visibleLeafNodeId ?? '',
        threadMessages.map((node) => node.id).join('|'),
        getStreamingContentLength(streamingAssistant),
      ].join('::'),
    [streamingAssistant, threadMessages, visibleLeafNodeId]
  );

  const handleRefresh = useCallback(() => {
    if (!threadId || !artifactId) {
      return;
    }

    setIsRefreshing(true);
    void Promise.all([
      refreshOverview('refresh'),
      loadMessages({
        artifactId,
        force: true,
        projectId,
        session: { sessionId: threadId },
      }),
    ]).finally(() => {
      setIsRefreshing(false);
    });
  }, [artifactId, loadMessages, projectId, refreshOverview, threadId]);

  const showNotFound = useMemo(() => {
    if (!threadId || !artifactId) {
      return true;
    }

    if (threadMessages.length > 0 || streamingAssistant) {
      return false;
    }

    return !session && !isLoadingOverview && !isThreadLoading && !threadError;
  }, [
    artifactId,
    isLoadingOverview,
    isThreadLoading,
    session,
    streamingAssistant,
    threadError,
    threadId,
    threadMessages.length,
  ]);

  const isInitialLoading = isThreadLoading && threadMessages.length === 0 && !streamingAssistant;
  const composerReserveHeight = Math.max(composerHeight, 132);
  const endSpacerHeight = Math.round(windowHeight * 0.4);

  useEffect(() => {
    if (!threadId || isThreadLoading || !hasRenderableContent) {
      return;
    }

    if (lastContentKeyRef.current === contentKey) {
      return;
    }

    lastContentKeyRef.current = contentKey;

    if (!hasCompletedInitialScrollRef.current) {
      requestScrollToBottom('initial');
      return;
    }

    if (shouldStickToBottomRef.current) {
      requestScrollToBottom('append');
    }
  }, [contentKey, hasRenderableContent, isThreadLoading, requestScrollToBottom, threadId]);

  useEffect(() => {
    const previousHeight = lastComposerReserveHeightRef.current;
    lastComposerReserveHeightRef.current = composerReserveHeight;

    if (
      previousHeight === 0 ||
      previousHeight === composerReserveHeight ||
      !threadId ||
      isThreadLoading ||
      !hasRenderableContent
    ) {
      return;
    }

    if (!hasCompletedInitialScrollRef.current || shouldStickToBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [composerReserveHeight, hasRenderableContent, isThreadLoading, threadId]);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1" style={{ paddingBottom: composerReserveHeight + appSpacing.sm }}>
        <ScreenScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="gap-5"
          contentContainerStyle={{
            paddingTop: 12,
            paddingBottom: endSpacerHeight + appSpacing.lg,
          }}
          refreshControl={
            <RefreshControl
              colors={[mutedColor]}
              onRefresh={handleRefresh}
              refreshing={isRefreshing}
              tintColor={mutedColor}
            />
          }
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (pendingScrollModeRef.current) {
              flushPendingScroll();
            }
          }}
          onScroll={handleScroll}
        >
          {!isInitialLoading && threadError ? (
            <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
              <Card.Body className="gap-3 p-4">
                <AppText className="text-sm font-semibold text-foreground">
                  Couldn&apos;t load this thread
                </AppText>
                <AppText selectable className="text-sm leading-5 text-muted">
                  {threadError}
                </AppText>
                <Button
                  className="self-start"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    if (!threadId || !artifactId) {
                      return;
                    }

                    void loadMessages({
                      artifactId,
                      force: true,
                      projectId,
                      session: { sessionId: threadId },
                    });
                  }}
                >
                  <Button.Label>Retry</Button.Label>
                </Button>
              </Card.Body>
            </Card>
          ) : null}

          {!isInitialLoading && sidebarError && !threadError && threadMessages.length === 0 ? (
            <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
              <Card.Body className="gap-3 p-4">
                <AppText className="text-sm font-semibold text-foreground">
                  Project overview is out of date
                </AppText>
                <AppText selectable className="text-sm leading-5 text-muted">
                  {sidebarError}
                </AppText>
              </Card.Body>
            </Card>
          ) : null}

          {!isInitialLoading && showNotFound ? (
            <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
              <Card.Body className="items-center gap-3 p-6">
                <AppText className="text-base font-semibold text-foreground">
                  Thread not found
                </AppText>
                <AppText className="text-center text-sm text-muted">
                  This session is unavailable in the current artifact directory.
                </AppText>
              </Card.Body>
            </Card>
          ) : null}

          {isInitialLoading ? <ThreadLoadingSkeleton /> : null}

          {!isInitialLoading && !showNotFound && threadId && artifactId ? (
            <ThreadMessages
              artifactId={artifactId}
              isStreaming={isThreadStreaming}
              messageTree={messageTree}
              messages={threadMessages}
              projectId={projectId}
              sessionId={threadId}
              streamingAssistant={streamingAssistant}
            />
          ) : null}
        </ScreenScrollView>
      </View>

      <ProjectPromptComposer
        artifactId={artifactId ?? ''}
        onHeightChange={setComposerHeight}
        projectId={projectId}
        threadId={threadId}
        visible
      />
    </View>
  );
}
