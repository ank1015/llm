import Feather from '@expo/vector-icons/Feather';
import { DrawerContentScrollView, useDrawerProgress } from '@react-navigation/drawer';
import { useLocalSearchParams, useRouter , useNavigation } from 'expo-router';
import { type ComponentProps, type FC, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import type { ArtifactDirWithSessions, OverviewSession } from '@/lib/client-api';
import type { DrawerNavigationProp , DrawerContentComponentProps } from '@react-navigation/drawer';
import type { ParamListBase } from '@react-navigation/native';

import { AppText } from '@/components/app-text';
import { useProjectShell } from '@/components/projects/project-shell-context';
import { useChatStore, useSidebarStore } from '@/stores';

const StyledFeather = withUniwind(Feather);

function formatThreadLabel(count: number): string {
  return `${count} ${count === 1 ? 'thread' : 'threads'}`;
}

type DrawerRowProps = {
  active?: boolean;
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  secondaryText?: string;
};

const DrawerRow: FC<DrawerRowProps> = ({ active, icon, label, onPress, secondaryText }) => {
  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      className={active ? 'bg-foreground/10' : 'bg-transparent'}
      onPress={onPress}
      style={{
        borderCurve: 'continuous',
        borderRadius: 18,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <View className="flex-row items-center gap-3">
        <View className="size-8 items-center justify-center rounded-full bg-foreground/6">
          <StyledFeather className="text-foreground/85" name={icon} size={16} />
        </View>
        <View className="flex-1 gap-0.5">
          <AppText className="text-sm font-medium text-foreground" numberOfLines={1}>
            {label}
          </AppText>
          {secondaryText ? (
            <AppText className="text-xs text-muted" numberOfLines={1}>
              {secondaryText}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

type SessionRowProps = {
  artifactId: string;
  projectId: string;
  session: OverviewSession;
  active: boolean;
};

const SessionRow: FC<SessionRowProps> = ({ artifactId, projectId, session, active }) => {
  const router = useRouter();
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>();

  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      className={active ? 'bg-foreground/10' : 'bg-transparent'}
      onPress={() => {
        setActiveSession({ sessionId: session.sessionId });
        navigation.closeDrawer();
        router.push({
          pathname: '/[projectId]/[artifactId]/[threadId]',
          params: {
            projectId,
            artifactId,
            threadId: session.sessionId,
          },
        });
      }}
      style={{
        borderCurve: 'continuous',
        borderRadius: 14,
        marginLeft: 14,
        paddingHorizontal: 12,
        paddingVertical: 9,
      }}
    >
      <View className="flex-row items-center gap-3">
        <StyledFeather className="text-foreground/60" name="message-square" size={14} />
        <View className="flex-1 gap-0.5">
          <AppText className="text-[13px] font-medium text-foreground" numberOfLines={1}>
            {session.sessionName}
          </AppText>
          <AppText className="text-[11px] text-muted">
            {session.nodeCount} {session.nodeCount === 1 ? 'message' : 'messages'}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
};

type ArtifactGroupProps = {
  activeArtifactId: string | null;
  activeThreadId: string | null;
  artifact: ArtifactDirWithSessions;
  expanded: boolean;
  onToggle: () => void;
  projectId: string;
};

const ArtifactGroup: FC<ArtifactGroupProps> = ({
  activeArtifactId,
  activeThreadId,
  artifact,
  expanded,
  onToggle,
  projectId,
}) => {
  const router = useRouter();
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>();
  const isArtifactActive = activeArtifactId === artifact.id && !activeThreadId;

  return (
    <View className="gap-1">
      <View
        className={isArtifactActive ? 'bg-foreground/10' : 'bg-transparent'}
        style={{
          borderCurve: 'continuous',
          borderRadius: 18,
          paddingHorizontal: 6,
          paddingVertical: 6,
        }}
      >
        <View className="flex-row items-center gap-1">
          <Pressable
            android_ripple={{ color: 'transparent' }}
            hitSlop={10}
            onPress={onToggle}
            style={{
              alignItems: 'center',
              borderCurve: 'continuous',
              borderRadius: 12,
              height: 28,
              justifyContent: 'center',
              width: 28,
            }}
          >
            <StyledFeather
              className="text-foreground/70"
              name={expanded ? 'chevron-down' : 'chevron-right'}
              size={16}
            />
          </Pressable>

          <Pressable
            android_ripple={{ color: 'transparent' }}
            className="flex-1"
            onPress={() => {
              navigation.closeDrawer();
              router.push({
                pathname: '/[projectId]/[artifactId]',
                params: {
                  projectId,
                  artifactId: artifact.id,
                },
              });
            }}
            style={{
              borderCurve: 'continuous',
              borderRadius: 14,
              paddingHorizontal: 6,
              paddingVertical: 4,
            }}
          >
            <View className="flex-row items-center gap-3">
              <View className="size-8 items-center justify-center rounded-full bg-foreground/6">
                <StyledFeather className="text-foreground/80" name="folder" size={16} />
              </View>
              <View className="flex-1 gap-0.5">
                <AppText className="text-sm font-medium text-foreground" numberOfLines={1}>
                  {artifact.name}
                </AppText>
                <AppText className="text-xs text-muted">
                  {formatThreadLabel(artifact.sessions.length)}
                </AppText>
              </View>
            </View>
          </Pressable>
        </View>
      </View>

      {expanded ? (
        artifact.sessions.length > 0 ? (
          <View className="gap-1">
            {artifact.sessions.map((session) => (
              <SessionRow
                key={session.sessionId}
                active={activeThreadId === session.sessionId}
                artifactId={artifact.id}
                projectId={projectId}
                session={session}
              />
            ))}
          </View>
        ) : (
          <AppText className="pl-12 text-xs text-muted">No threads yet</AppText>
        )
      ) : null}
    </View>
  );
};

type ProjectSidebarDrawerProps = DrawerContentComponentProps & {
  onRefresh: () => Promise<void>;
  projectId: string;
};

export const ProjectSidebarDrawer: FC<ProjectSidebarDrawerProps> = ({
  onRefresh,
  projectId,
  ...drawerProps
}) => {
  const router = useRouter();
  const progress = useDrawerProgress();
  const params = useLocalSearchParams<{
    artifactId?: string | string[];
    threadId?: string | string[];
  }>();
  const projectName = useSidebarStore((state) => state.projectName);
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const isLoading = useSidebarStore((state) => state.isLoading);
  const error = useSidebarStore((state) => state.error);
  const { projectId: currentProjectId } = useProjectShell();

  const [expandedArtifacts, setExpandedArtifacts] = useState<Record<string, boolean>>({});
  const currentArtifactId =
    (Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId) ?? null;
  const currentThreadId =
    (Array.isArray(params.threadId) ? params.threadId[0] : params.threadId) ?? null;

  useEffect(() => {
    setExpandedArtifacts((state) => {
      const next = { ...state };
      for (const artifact of artifactDirs) {
        next[artifact.id] = state[artifact.id] ?? artifact.id === currentArtifactId;
      }
      return next;
    });
  }, [artifactDirs, currentArtifactId]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(progress.value, [0, 1], [0.7, 1]),
      transform: [
        {
          translateX: interpolate(progress.value, [0, 1], [-20, 0]),
        },
      ],
    };
  });

  return (
    <Animated.View
      className="flex-1 bg-background"
      style={[
        animatedStyle,
        {
          flex: 1,
        },
      ]}
    >
      <DrawerContentScrollView
        {...drawerProps}
        contentContainerStyle={{
          gap: 18,
          paddingTop: 12,
          paddingHorizontal: 12,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-3 pb-1">
          <AppText className="text-xs uppercase tracking-[1px] text-muted">Workspace</AppText>
          <Pressable
            android_ripple={{ color: 'transparent' }}
            onPress={() => {
              drawerProps.navigation.closeDrawer();
              router.push({
                pathname: '/[projectId]',
                params: { projectId: currentProjectId },
              });
            }}
            style={{
              borderCurve: 'continuous',
              borderRadius: 18,
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
            }}
          >
            <View className="flex-row items-center gap-3">
              <View className="size-10 items-center justify-center rounded-full bg-foreground/6">
                <StyledFeather className="text-foreground" name="grid" size={18} />
              </View>
              <View className="flex-1 gap-1">
                <AppText className="text-base font-semibold text-foreground" numberOfLines={1}>
                  {projectName ?? 'Project'}
                </AppText>
                <AppText className="text-xs text-muted">Overview and artifact directories</AppText>
              </View>
            </View>
          </Pressable>
        </View>

        <View className="gap-1">
          <DrawerRow
            active={!currentArtifactId}
            icon="home"
            label="Overview"
            onPress={() => {
              drawerProps.navigation.closeDrawer();
              router.push({
                pathname: '/[projectId]',
                params: { projectId },
              });
            }}
            secondaryText="Project summary"
          />
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between px-2">
            <AppText className="text-xs uppercase tracking-[1px] text-muted">Artifacts</AppText>
            <Pressable
              android_ripple={{ color: 'transparent' }}
              hitSlop={10}
              onPress={() => {
                void onRefresh();
              }}
              style={{
                alignItems: 'center',
                borderCurve: 'continuous',
                borderRadius: 12,
                height: 28,
                justifyContent: 'center',
                width: 28,
              }}
            >
              <StyledFeather
                className={isLoading ? 'text-foreground/40' : 'text-foreground/70'}
                name="refresh-cw"
                size={15}
              />
            </Pressable>
          </View>

          {error && artifactDirs.length === 0 ? (
            <View
              className="border border-red-500/20 bg-red-500/6"
              style={{
                borderCurve: 'continuous',
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
              }}
            >
              <AppText className="text-sm font-medium text-foreground">
                Couldn&apos;t load this project
              </AppText>
              <AppText className="mt-1 text-xs leading-5 text-muted">{error}</AppText>
              <Pressable
                android_ripple={{ color: 'transparent' }}
                onPress={() => {
                  void onRefresh();
                }}
                style={{
                  borderCurve: 'continuous',
                  borderRadius: 14,
                  marginTop: 12,
                  paddingVertical: 6,
                }}
              >
                <AppText className="text-sm font-medium text-foreground">Retry</AppText>
              </Pressable>
            </View>
          ) : null}

          {isLoading && artifactDirs.length === 0 ? (
            <View className="gap-2 px-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <View
                  key={`artifact-skeleton-${index}`}
                  className="bg-foreground/6"
                  style={{
                    borderCurve: 'continuous',
                    borderRadius: 18,
                    height: 56,
                  }}
                />
              ))}
            </View>
          ) : null}

          {!isLoading && artifactDirs.length === 0 && !error ? (
            <View
              className="bg-foreground/4"
              style={{
                borderCurve: 'continuous',
                borderRadius: 18,
                paddingHorizontal: 14,
                paddingVertical: 14,
              }}
            >
              <AppText className="text-sm text-muted">No artifact directories yet.</AppText>
            </View>
          ) : null}

          {artifactDirs.length > 0 ? (
            <View className="gap-2">
              {artifactDirs.map((artifact) => (
                <ArtifactGroup
                  key={artifact.id}
                  activeArtifactId={currentArtifactId}
                  activeThreadId={currentThreadId}
                  artifact={artifact}
                  expanded={expandedArtifacts[artifact.id] ?? false}
                  onToggle={() => {
                    setExpandedArtifacts((state) => ({
                      ...state,
                      [artifact.id]: !state[artifact.id],
                    }));
                  }}
                  projectId={projectId}
                />
              ))}
            </View>
          ) : null}
        </View>
      </DrawerContentScrollView>
    </Animated.View>
  );
};
