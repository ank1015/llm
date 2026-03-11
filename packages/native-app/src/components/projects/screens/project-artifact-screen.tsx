import { Link, useLocalSearchParams } from 'expo-router';
import { Tabs } from 'heroui-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { OverviewSession } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { ProjectArtifactExplorer } from '@/components/projects/artifacts/project-artifact-explorer';
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
          <ScreenScrollView
            className="flex-1"
            contentContainerClassName={appLayout.artifactScreen}
            contentContainerStyle={{
              paddingTop: appSpacing.sm,
              paddingBottom: composerHeight + appSpacing.xl,
            }}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
          >
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
          </ScreenScrollView>
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
