import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Spinner, cn, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useSidebarStore } from '@/stores';

const StyledFeather = withUniwind(Feather);
const darkBorderClassName = 'border-zinc-900';
const surfaceCardClassName = 'border border-zinc-200 shadow-none';

function formatDateLabel(value: string): string {
  return new Date(value).toLocaleDateString();
}

function formatThreadLabel(count: number): string {
  return `${count} ${count === 1 ? 'thread' : 'threads'}`;
}

export function ProjectArtifactScreen() {
  const params = useLocalSearchParams<{
    artifactId?: string | string[];
    projectId?: string | string[];
  }>();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId) ?? null
  );
  const isLoading = useSidebarStore((state) => state.isLoading);
  const error = useSidebarStore((state) => state.error);
  const { refreshOverview } = useProjectShell();
  const { isDark } = useAppTheme();
  const accentColor = useThemeColor('accent');
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <ScreenScrollView
      contentContainerClassName="gap-4"
      contentContainerStyle={{
        paddingTop: 12,
        paddingBottom: insets.bottom + 32,
      }}
      refreshControl={
        <RefreshControl
          colors={[accentColor]}
          onRefresh={() => {
            setIsRefreshing(true);
            void refreshOverview('refresh').finally(() => {
              setIsRefreshing(false);
            });
          }}
          refreshing={isRefreshing}
          tintColor={accentColor}
        />
      }
    >
      {isLoading && !artifact ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="items-center gap-3 p-6">
            <Spinner size="lg" />
            <AppText className="text-sm text-muted">Loading artifact…</AppText>
          </Card.Body>
        </Card>
      ) : null}

      {error && !artifact ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="gap-3 p-4">
            <AppText className="text-sm font-semibold text-foreground">
              Couldn&apos;t load this artifact
            </AppText>
            <AppText selectable className="text-sm leading-5 text-muted">
              {error}
            </AppText>
            <Button
              className="self-start"
              size="sm"
              variant="secondary"
              onPress={() => void refreshOverview('initial')}
            >
              <Button.Label>Retry</Button.Label>
            </Button>
          </Card.Body>
        </Card>
      ) : null}

      {!isLoading && !artifact ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="items-center gap-3 p-6">
            <AppText className="text-base font-semibold text-foreground">
              Artifact not found
            </AppText>
            <AppText className="text-center text-sm text-muted">
              This artifact directory is unavailable in the current project.
            </AppText>
          </Card.Body>
        </Card>
      ) : null}

      {artifact ? (
        <>
          <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
            <Card.Body className="gap-3 p-4">
              <View className="flex-row items-start gap-3">
                <View className="size-12 items-center justify-center rounded-3xl bg-foreground/5">
                  <StyledFeather className="text-foreground/80" name="folder" size={20} />
                </View>
                <View className="flex-1 gap-1">
                  <AppText className="text-lg font-semibold text-foreground">
                    {artifact.name}
                  </AppText>
                  <AppText className="text-sm leading-5 text-muted">
                    {artifact.description?.trim().length
                      ? artifact.description
                      : 'No description yet for this artifact directory.'}
                  </AppText>
                </View>
              </View>

              <View className="flex-row items-center gap-4">
                <AppText className="text-xs text-muted">
                  {formatThreadLabel(artifact.sessions.length)}
                </AppText>
                <AppText className="text-xs text-muted">
                  Created {formatDateLabel(artifact.createdAt)}
                </AppText>
              </View>
            </Card.Body>
          </Card>

          <View className="gap-3">
            {artifact.sessions.length > 0 ? (
              artifact.sessions.map((session) => (
                <Pressable
                  key={session.sessionId}
                  android_ripple={{ color: 'transparent' }}
                  onPress={() => {
                    if (!projectId) {
                      return;
                    }

                    router.push({
                      pathname: '/[projectId]/[artifactId]/[threadId]',
                      params: {
                        projectId,
                        artifactId: artifact.id,
                        threadId: session.sessionId,
                      },
                    });
                  }}
                >
                  <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
                    <Card.Body className="gap-2 p-4">
                      <View className="flex-row items-center gap-3">
                        <View className="size-10 items-center justify-center rounded-3xl bg-foreground/5">
                          <StyledFeather
                            className="text-foreground/70"
                            name="message-square"
                            size={16}
                          />
                        </View>
                        <View className="flex-1 gap-1">
                          <AppText className="text-sm font-semibold text-foreground">
                            {session.sessionName}
                          </AppText>
                          <AppText className="text-xs text-muted">
                            {session.nodeCount} {session.nodeCount === 1 ? 'message' : 'messages'}
                          </AppText>
                        </View>
                        <StyledFeather
                          className="text-foreground/40"
                          name="chevron-right"
                          size={16}
                        />
                      </View>
                    </Card.Body>
                  </Card>
                </Pressable>
              ))
            ) : (
              <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
                <Card.Body className="items-center gap-3 p-6">
                  <AppText className="text-base font-semibold text-foreground">
                    No threads yet
                  </AppText>
                  <AppText className="text-center text-sm text-muted">
                    Threads created for this artifact will appear here.
                  </AppText>
                </Card.Body>
              </Card>
            )}
          </View>
        </>
      ) : null}
    </ScreenScrollView>
  );
}
