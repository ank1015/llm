import Feather from '@expo/vector-icons/Feather';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { type FC, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores';
import {
  appColors,
  appLayout,
  appListStyles,
  appSizes,
  appSpacing,
  appTypography,
} from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

type ProjectNameSidebarItemProps = {
  isActive: boolean;
  onPress: () => void;
  projectName: string | null;
};

const ProjectNameSidebarItem: FC<ProjectNameSidebarItemProps> = ({
  isActive,
  onPress,
  projectName,
}) => {
  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      onPress={onPress}
      style={{ borderCurve: 'continuous' }}
    >
      <View
        className={cn(
          appListStyles.filesystemRow,
          appListStyles.sidebarPrimaryRow,
          appListStyles.sidebarItemSurface,
          isActive && appColors.surfaceDefault
        )}
      >
        <StyledFeather className="text-foreground" name="package" size={appSizes.iconLg} />
        <AppText className={appTypography.title} numberOfLines={1} style={{ flex: 1 }}>
          {projectName ?? 'Project'}
        </AppText>
      </View>
    </Pressable>
  );
};

type SidebarDisclosureItemProps = {
  expanded: boolean;
  isActive: boolean;
  label: string;
  onPress: () => void;
  onToggle: () => void;
};

const SidebarDisclosureItem: FC<SidebarDisclosureItemProps> = ({
  expanded,
  isActive,
  label,
  onPress,
  onToggle,
}) => {
  return (
    <View
      className={cn(
        appListStyles.filesystemRow,
        appListStyles.sidebarPrimaryRow,
        appListStyles.sidebarItemSurface,
        isActive && appColors.surfaceDefault
      )}
    >
      <Pressable
        android_ripple={{ color: 'transparent' }}
        hitSlop={10}
        onPress={onToggle}
        style={{ borderCurve: 'continuous', padding: 2 }}
      >
        <StyledFeather
          className="text-foreground"
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={appSizes.iconLg}
        />
      </Pressable>
      <Pressable
        android_ripple={{ color: 'transparent' }}
        onPress={onPress}
        style={{ borderCurve: 'continuous', flex: 1 }}
      >
        <AppText className={appTypography.title} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
};

type SidebarThreadItemProps = {
  isActive: boolean;
  label: string;
  onPress: () => void;
};

const SidebarThreadItem: FC<SidebarThreadItemProps> = ({ isActive, label, onPress }) => {
  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      onPress={onPress}
      style={{ borderCurve: 'continuous' }}
    >
      <View className={cn(appListStyles.sidebarThreadItem, isActive && appColors.surfaceDefault)}>
        <AppText className={appTypography.sidebarChatTitle} ellipsizeMode="tail" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
};

export const ProjectSidebarDrawer: FC<DrawerContentComponentProps> = (drawerProps) => {
  const router = useRouter();
  const params = useGlobalSearchParams<{
    artifactId?: string | string[];
    threadId?: string | string[];
  }>();
  const { projectId } = useProjectShell();
  const projectName = useSidebarStore((state) => state.projectName);
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const insets = useSafeAreaInsets();
  const [expandedArtifacts, setExpandedArtifacts] = useState<Record<string, boolean>>({});
  const activeArtifactId = Array.isArray(params.artifactId)
    ? params.artifactId[0]
    : params.artifactId;
  const activeThreadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const isProjectActive = !activeArtifactId && !activeThreadId;

  return (
    <DrawerContentScrollView
      {...drawerProps}
      className={appColors.background}
      contentContainerStyle={{
        paddingTop: insets.top + 2,
        paddingHorizontal: appSpacing.md,
        paddingBottom: appSpacing.screenBottomOffset,
      }}
      showsVerticalScrollIndicator={false}
    >
      <ProjectNameSidebarItem
        isActive={isProjectActive}
        projectName={projectName}
        onPress={() => {
          drawerProps.navigation.closeDrawer();
          router.replace({
            pathname: '/[projectId]',
            params: { projectId },
          });
        }}
      />
      <View className={appLayout.sidebarSection}>
        <View className={appLayout.sidebarSectionHeader}>
          <AppText className={appTypography.sidebarSectionLabel}>Artifacts</AppText>
          <Pressable
            android_ripple={{ color: 'transparent' }}
            hitSlop={10}
            style={{ borderCurve: 'continuous', padding: 2 }}
          >
            <StyledFeather className="text-foreground" name="plus" size={appSizes.iconMd} />
          </Pressable>
        </View>

        {artifactDirs.map((artifact) => {
          const isArtifactActive = activeArtifactId === artifact.id && !activeThreadId;
          const isExpanded = expandedArtifacts[artifact.id] ?? activeArtifactId === artifact.id;

          return (
            <View key={artifact.id}>
              <SidebarDisclosureItem
                expanded={isExpanded}
                isActive={isArtifactActive}
                label={artifact.name}
                onPress={() => {
                  drawerProps.navigation.closeDrawer();
                  router.replace({
                    pathname: '/[projectId]/[artifactId]',
                    params: {
                      projectId,
                      artifactId: artifact.id,
                    },
                  });
                }}
                onToggle={() => {
                  setExpandedArtifacts((current) => ({
                    ...current,
                    [artifact.id]: !current[artifact.id],
                  }));
                }}
              />

              {isExpanded ? (
                <View className={appLayout.sidebarNestedList}>
                  {artifact.sessions.map((session) => (
                    <SidebarThreadItem
                      key={session.sessionId}
                      isActive={activeThreadId === session.sessionId}
                      label={session.sessionName}
                      onPress={() => {
                        drawerProps.navigation.closeDrawer();
                        router.replace({
                          pathname: '/[projectId]/[artifactId]/[threadId]',
                          params: {
                            projectId,
                            artifactId: artifact.id,
                            threadId: session.sessionId,
                          },
                        });
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </DrawerContentScrollView>
  );
};
