import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Spinner, cn, useThemeColor } from 'heroui-native';
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
  const [accentColor, backgroundColor, foregroundColor] = useThemeColor([
    'accent',
    'background',
    'foreground',
  ]);
  const { height: windowHeight } = useWindowDimensions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef(false);
  const autoScrollRequestedRef = useRef(false);
  const autoScrollAnimatedRef = useRef(true);

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

  const scrollToBottom = useCallback((animated: boolean) => {
    autoScrollRequestedRef.current = true;
    autoScrollAnimatedRef.current = animated;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldStickToBottomRef.current = distanceFromBottom <= 140;
  }, []);

  useEffect(() => {
    if (!threadId || isThreadLoading) {
      return;
    }

    const hasRenderableContent = threadMessages.length > 0 || Boolean(streamingAssistant);
    if (!hasRenderableContent) {
      return;
    }

    if (hasScrolledInitiallyRef.current && !shouldStickToBottomRef.current) {
      return;
    }

    const animated = hasScrolledInitiallyRef.current;
    hasScrolledInitiallyRef.current = true;
    scrollToBottom(animated);
  }, [
    isThreadLoading,
    isThreadStreaming,
    scrollToBottom,
    streamingAssistant,
    threadId,
    threadMessages,
    visibleLeafNodeId,
  ]);

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
  const endSpacerHeight = Math.round(windowHeight * 0.22);
  const composerMaskHeight = composerReserveHeight + appSpacing.sm;

  if (isInitialLoading) {
    return (
      <View className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center">
          <Spinner color={foregroundColor} size="lg" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gap-5"
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: appSpacing.lg,
        }}
        refreshControl={
          <RefreshControl
            colors={[accentColor]}
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor={accentColor}
          />
        }
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (!autoScrollRequestedRef.current) {
            return;
          }

          autoScrollRequestedRef.current = false;
          requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd({ animated: autoScrollAnimatedRef.current });
          });
        }}
        onScroll={handleScroll}
      >
        {threadError ? (
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

        {sidebarError && !threadError && threadMessages.length === 0 ? (
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

        {showNotFound ? (
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

        {!showNotFound && threadId && artifactId ? (
          <>
            <ThreadMessages
              artifactId={artifactId}
              isStreaming={isThreadStreaming}
              messageTree={messageTree}
              messages={threadMessages}
              projectId={projectId}
              sessionId={threadId}
              streamingAssistant={streamingAssistant}
            />
            <View style={{ height: composerReserveHeight + endSpacerHeight }} />
          </>
        ) : null}
      </ScreenScrollView>

      <View
        pointerEvents="none"
        style={{
          backgroundColor,
          bottom: 0,
          height: composerMaskHeight,
          left: 0,
          position: 'absolute',
          right: 0,
        }}
      />

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
