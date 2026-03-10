import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Spinner, cn, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useChatStore, useSidebarStore } from '@/stores';

const StyledFeather = withUniwind(Feather);
const darkBorderClassName = 'border-zinc-900';
const surfaceCardClassName = 'border border-zinc-200 shadow-none';

function formatDateLabel(value: string | null): string {
  if (!value) {
    return 'No recent activity';
  }

  return new Date(value).toLocaleString();
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
  const isLoading = useSidebarStore((state) => state.isLoading);
  const error = useSidebarStore((state) => state.error);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const { refreshOverview } = useProjectShell();
  const { isDark } = useAppTheme();
  const accentColor = useThemeColor('accent');
  const insets = useSafeAreaInsets();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!threadId) {
      return;
    }

    setActiveSession({ sessionId: threadId });
  }, [setActiveSession, threadId]);

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
      {isLoading && !session ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="items-center gap-3 p-6">
            <Spinner size="lg" />
            <AppText className="text-sm text-muted">Loading thread…</AppText>
          </Card.Body>
        </Card>
      ) : null}

      {error && !session ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="gap-3 p-4">
            <AppText className="text-sm font-semibold text-foreground">
              Couldn&apos;t load this thread
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

      {!isLoading && !session ? (
        <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
          <Card.Body className="items-center gap-3 p-6">
            <AppText className="text-base font-semibold text-foreground">Thread not found</AppText>
            <AppText className="text-center text-sm text-muted">
              This session is unavailable in the current artifact directory.
            </AppText>
          </Card.Body>
        </Card>
      ) : null}

      {session ? (
        <>
          <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
            <Card.Body className="gap-3 p-4">
              <View className="flex-row items-start gap-3">
                <View className="size-12 items-center justify-center rounded-3xl bg-foreground/5">
                  <StyledFeather className="text-foreground/80" name="message-square" size={20} />
                </View>
                <View className="flex-1 gap-1">
                  <AppText className="text-lg font-semibold text-foreground">
                    {session.sessionName}
                  </AppText>
                  <AppText className="text-sm leading-5 text-muted">
                    {artifact?.name ?? 'Artifact'} conversation
                  </AppText>
                </View>
              </View>

              <View className="gap-1">
                <AppText className="text-xs text-muted">
                  {session.nodeCount} {session.nodeCount === 1 ? 'message' : 'messages'}
                </AppText>
                <AppText className="text-xs text-muted">
                  Updated {formatDateLabel(session.updatedAt)}
                </AppText>
              </View>
            </Card.Body>
          </Card>

          <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
            <Card.Body className="gap-3 p-4">
              <AppText className="text-sm font-semibold text-foreground">
                Conversation screen is next
              </AppText>
              <AppText className="text-sm leading-6 text-muted">
                The shared drawer is now wired for thread routes. Message history and composer UI
                can plug into this screen next without changing the navigation shell.
              </AppText>
            </Card.Body>
          </Card>
        </>
      ) : null}
    </ScreenScrollView>
  );
}
