import { Link, useLocalSearchParams } from 'expo-router';
import { Skeleton, Tabs, useThemeColor } from 'heroui-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  View,
  useWindowDimensions,
  type ScrollView,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { ProjectArtifactExplorer } from '@/components/projects/artifacts/project-artifact-explorer';
import { ProjectPromptComposer } from '@/components/projects/composer/project-prompt-composer';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useSidebarStore } from '@/stores';
import { appLayout, appSpacing, appTabsStyles, appTypography } from '@/styles/ui';

const CHAT_SKELETON_WIDTHS = ['w-[88%]', 'w-[76%]', 'w-[82%]', 'w-[68%]'] as const;

function ArtifactChatSkeletonRow({ index }: { index: number }) {
  return (
    <View className={appLayout.artifactChatRow}>
      <Skeleton
        className={`h-8 rounded-md ${CHAT_SKELETON_WIDTHS[index % CHAT_SKELETON_WIDTHS.length]}`}
      />
    </View>
  );
}

export function ProjectArtifactScreen() {
  const params = useLocalSearchParams<{ artifactId?: string | string[] }>();
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  const { projectId, refreshOverview } = useProjectShell();
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId) ?? null
  );
  const isLoading = useSidebarStore((state) => state.isLoading);
  const isRefreshing = useSidebarStore((state) => state.isRefreshing);
  const error = useSidebarStore((state) => state.error);
  const [activeTab, setActiveTab] = useState('chats');
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const wasRefreshingRef = useRef(false);
  const { height: windowHeight } = useWindowDimensions();
  const [mutedColor] = useThemeColor(['muted']);
  const composerInset = activeTab === 'chats' ? composerHeight + appSpacing.sm : 0;
  const endSpacerHeight = Math.round(windowHeight * 0.4);
  const shouldShowChatSkeletons = !artifact && !error && (isLoading || isRefreshing);

  useEffect(() => {
    if (wasRefreshingRef.current && !isRefreshing) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          animated: false,
          y: 0,
        });
      });
    }

    wasRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  const sessions = useMemo(() => {
    if (!artifact) {
      return [];
    }

    return [...artifact.sessions].sort((left, right) => {
      const leftTimestamp = Date.parse(left.updatedAt ?? left.createdAt);
      const rightTimestamp = Date.parse(right.updatedAt ?? right.createdAt);

      return rightTimestamp - leftTimestamp;
    });
  }, [artifact]);
  return (
    <View className="flex-1 bg-background">
      <Tabs className="flex-1" onValueChange={setActiveTab} value={activeTab} variant="primary">
        <View className="px-5" style={{ paddingTop: appSpacing.lg, paddingBottom: appSpacing.sm }}>
          {/* Artifact header intentionally remains commented out for now. */}
          <View className={appLayout.artifactTabsSection}>
            <Tabs.List className={appTabsStyles.artifactList}>
              <Tabs.Indicator className={appTabsStyles.artifactIndicator} />
              <Tabs.Trigger className={appTabsStyles.artifactTrigger} value="chats">
                {({ isSelected }) => (
                  <Tabs.Label
                    className={
                      isSelected
                        ? appTypography.artifactTabActiveLabel
                        : appTypography.artifactTabInactiveLabel
                    }
                  >
                    Chats
                  </Tabs.Label>
                )}
              </Tabs.Trigger>
              <Tabs.Trigger className={appTabsStyles.artifactTrigger} value="artifacts">
                {({ isSelected }) => (
                  <Tabs.Label
                    className={
                      isSelected
                        ? appTypography.artifactTabActiveLabel
                        : appTypography.artifactTabInactiveLabel
                    }
                  >
                    Artifacts
                  </Tabs.Label>
                )}
              </Tabs.Trigger>
            </Tabs.List>
          </View>
        </View>

        <Tabs.Content className="flex-1" value="chats">
          <View className="flex-1" style={{ paddingBottom: composerInset }}>
            <ScreenScrollView
              ref={scrollRef}
              alwaysBounceVertical
              className="flex-1"
              contentContainerClassName={appLayout.artifactScreen}
              contentContainerStyle={{
                paddingTop: appSpacing.sm,
                paddingBottom: appSpacing.lg,
              }}
              contentInsetAdjustmentBehavior="never"
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  colors={[mutedColor]}
                  onRefresh={() => {
                    void refreshOverview('refresh');
                  }}
                  refreshing={isRefreshing}
                  tintColor={mutedColor}
                />
              }
            >
              <View className={appLayout.artifactChatList}>
                {error && !artifact ? (
                  <AppText className={appTypography.body}>{error}</AppText>
                ) : null}

                {shouldShowChatSkeletons
                  ? Array.from({ length: 4 }, (_, index) => (
                      <ArtifactChatSkeletonRow
                        key={`artifact-chat-skeleton-${index}`}
                        index={index}
                      />
                    ))
                  : null}

                {!shouldShowChatSkeletons && !isLoading && !error && !artifact ? (
                  <AppText className={appTypography.bodyMuted}>Artifact not found.</AppText>
                ) : null}

                {!shouldShowChatSkeletons && artifact && sessions.length === 0 ? (
                  <AppText className={appTypography.bodyMuted}>No chats yet.</AppText>
                ) : null}

                {!shouldShowChatSkeletons && artifact
                  ? sessions.map((session) => (
                      <Link
                        key={session.sessionId}
                        asChild
                        href={{
                          pathname: '/[projectId]/[artifactId]/[threadId]',
                          params: {
                            projectId,
                            artifactId: artifact.id,
                            threadId: session.sessionId,
                          },
                        }}
                      >
                        <Pressable
                          android_ripple={{ color: 'transparent' }}
                          pressRetentionOffset={{ bottom: 12, left: 0, right: 0, top: 12 }}
                          style={{ borderCurve: 'continuous' }}
                        >
                          <View className={appLayout.artifactChatRow}>
                            <AppText className={appTypography.artifactChatTitle} numberOfLines={1}>
                              {session.sessionName}
                            </AppText>
                          </View>
                        </Pressable>
                      </Link>
                    ))
                  : null}

                <View pointerEvents="none" style={{ height: endSpacerHeight }} />
              </View>
            </ScreenScrollView>
          </View>
        </Tabs.Content>

        <Tabs.Content className="flex-1" value="artifacts">
          <ProjectArtifactExplorer artifactId={artifactId ?? ''} projectId={projectId} />
        </Tabs.Content>
      </Tabs>

      <ProjectPromptComposer
        artifactId={artifactId ?? ''}
        onHeightChange={setComposerHeight}
        projectId={projectId}
        visible={activeTab === 'chats'}
      />
    </View>
  );
}
