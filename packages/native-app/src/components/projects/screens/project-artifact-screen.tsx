import { Link, useLocalSearchParams } from 'expo-router';
import { Tabs } from 'heroui-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { OverviewSession } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { ProjectPromptComposer } from '@/components/projects/composer/project-prompt-composer';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useSidebarStore } from '@/stores';
import { appLayout, appSpacing, appTabsStyles, appTypography } from '@/styles/ui';

function formatSessionMeta(session: OverviewSession): string {
  const messageLabel = `${session.nodeCount} ${session.nodeCount === 1 ? 'message' : 'messages'}`;
  const timestamp = session.updatedAt ?? session.createdAt;
  const dateLabel = new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${messageLabel} • ${dateLabel}`;
}

export function ProjectArtifactScreen() {
  const params = useLocalSearchParams<{ artifactId?: string | string[] }>();
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  const { projectId } = useProjectShell();
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId) ?? null
  );
  const isLoading = useSidebarStore((state) => state.isLoading);
  const error = useSidebarStore((state) => state.error);
  const [activeTab, setActiveTab] = useState('chats');
  const [composerHeight, setComposerHeight] = useState(0);

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
      <ScreenScrollView
        className="flex-1"
        contentContainerClassName={appLayout.artifactScreen}
        contentContainerStyle={{
          paddingTop: appSpacing.lg,
          paddingBottom: composerHeight + appSpacing.xl,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        {/* Artifact header intentionally remains commented out for now. */}

        <Tabs
          className={appLayout.artifactTabsSection}
          onValueChange={setActiveTab}
          value={activeTab}
          variant="primary"
        >
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

          <Tabs.Content className={appTabsStyles.artifactContent} value="chats">
            <View className={appLayout.artifactChatList}>
              {error && !artifact ? (
                <AppText className={appTypography.body}>{error}</AppText>
              ) : null}

              {isLoading && !artifact ? (
                <AppText className={appTypography.bodyMuted}>Loading artifact…</AppText>
              ) : null}

              {!isLoading && !error && !artifact ? (
                <AppText className={appTypography.bodyMuted}>Artifact not found.</AppText>
              ) : null}

              {artifact && sessions.length === 0 ? (
                <AppText className={appTypography.bodyMuted}>No chats yet.</AppText>
              ) : null}

              {artifact
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
                        style={{ borderCurve: 'continuous' }}
                      >
                        <View className={appLayout.artifactChatRow}>
                          <AppText className={appTypography.artifactChatTitle} numberOfLines={1}>
                            {session.sessionName}
                          </AppText>
                          <AppText className={appTypography.artifactChatMeta} numberOfLines={1}>
                            {formatSessionMeta(session)}
                          </AppText>
                        </View>
                      </Pressable>
                    </Link>
                  ))
                : null}
            </View>
          </Tabs.Content>

          <Tabs.Content value="artifacts">
            <View />
          </Tabs.Content>
        </Tabs>
      </ScreenScrollView>

      <ProjectPromptComposer
        artifactId={artifactId ?? ''}
        onHeightChange={setComposerHeight}
        projectId={projectId}
        visible={activeTab === 'chats'}
      />
    </View>
  );
}
