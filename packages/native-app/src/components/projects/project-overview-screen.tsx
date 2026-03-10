import Feather from '@expo/vector-icons/Feather';
import { Button, Card, Spinner, cn, useThemeColor } from 'heroui-native';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { useProjectShell } from '@/components/projects/project-shell-context';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useSidebarStore } from '@/stores';

const StyledFeather = withUniwind(Feather);
const darkBorderClassName = 'border-zinc-900';
const surfaceCardClassName = 'border border-zinc-200 shadow-none';

function formatThreadLabel(count: number): string {
  return `${count} ${count === 1 ? 'thread' : 'threads'}`;
}

export function ProjectOverviewScreen() {
  const projectName = useSidebarStore((state) => state.projectName);
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const isLoading = useSidebarStore((state) => state.isLoading);
  const error = useSidebarStore((state) => state.error);

  const { isDark } = useAppTheme();
  const accentColor = useThemeColor('accent');
  const insets = useSafeAreaInsets();
  const { refreshOverview } = useProjectShell();
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
      <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
        <Card.Body className="gap-2 p-4">
          <AppText className="text-sm font-semibold text-foreground">
            {projectName ?? 'Project workspace'}
          </AppText>
          <AppText className="text-sm leading-6 text-muted">
            {artifactDirs.length === 0
              ? 'Artifacts created for this project will appear here.'
              : `${artifactDirs.length} artifact directories are currently available.`}
          </AppText>
        </Card.Body>
      </Card>

      {error ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="gap-3 p-4">
            <View className="flex-row items-start gap-3">
              <View className="size-10 items-center justify-center rounded-3xl bg-red-500/10">
                <StyledFeather className="text-red-500" name="alert-circle" size={18} />
              </View>
              <View className="flex-1 gap-1">
                <AppText className="text-sm font-semibold text-foreground">
                  Couldn&apos;t load this project
                </AppText>
                <AppText selectable className="text-sm leading-5 text-muted">
                  {error}
                </AppText>
              </View>
            </View>
            <Button
              className="self-start"
              size="sm"
              variant="secondary"
              onPress={() => {
                void refreshOverview('initial');
              }}
            >
              <Button.Label>Retry</Button.Label>
            </Button>
          </Card.Body>
        </Card>
      ) : null}

      {isLoading ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="items-center gap-3 p-6">
            <Spinner size="lg" />
            <AppText className="text-sm text-muted">Loading project…</AppText>
          </Card.Body>
        </Card>
      ) : null}

      {!isLoading && !error && artifactDirs.length === 0 ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="items-center gap-4 p-6">
            <View className="size-14 items-center justify-center rounded-full bg-foreground/5">
              <StyledFeather className="text-foreground/70" name="folder" size={22} />
            </View>
            <View className="items-center gap-1">
              <AppText className="text-base font-semibold text-foreground">
                No artifacts yet
              </AppText>
              <AppText className="text-center text-sm leading-5 text-muted">
                Create an artifact in the web app or server workflow and it will show up here.
              </AppText>
            </View>
          </Card.Body>
        </Card>
      ) : null}

      {!isLoading && artifactDirs.length > 0 ? (
        <View className="gap-3">
          {artifactDirs.map((artifact) => (
            <Card
              key={artifact.id}
              className={cn(surfaceCardClassName, isDark && darkBorderClassName)}
            >
              <Card.Body className="gap-3 p-4">
                <View className="flex-row items-start gap-3">
                  <View className="size-11 items-center justify-center rounded-3xl bg-foreground/5">
                    <StyledFeather className="text-foreground/80" name="folder" size={18} />
                  </View>
                  <View className="flex-1 gap-1">
                    <AppText className="text-base font-semibold text-foreground">
                      {artifact.name}
                    </AppText>
                    <AppText className="text-sm leading-5 text-muted">
                      {artifact.description?.trim().length
                        ? artifact.description
                        : 'No description yet for this artifact directory.'}
                    </AppText>
                  </View>
                </View>

                <AppText className="text-xs text-muted">
                  {formatThreadLabel(artifact.sessions.length)}
                </AppText>
              </Card.Body>
            </Card>
          ))}
        </View>
      ) : null}
    </ScreenScrollView>
  );
}
