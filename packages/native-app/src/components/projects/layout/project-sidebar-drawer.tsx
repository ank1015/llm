import Feather from '@expo/vector-icons/Feather';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { Button, useThemeColor, useToast } from 'heroui-native';
import { type FC, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { DrawerContentComponentProps } from '@react-navigation/drawer';

import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { CreateArtifactDialog } from '@/components/projects/dialogs/create-artifact-dialog';
import { RenameArtifactDialog } from '@/components/projects/dialogs/rename-artifact-dialog';
import { RenameSessionDialog } from '@/components/projects/dialogs/rename-session-dialog';
import { ProjectDrawerSettingsSheet } from '@/components/projects/layout/project-drawer-settings-sheet';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ProjectSidebarArtifactItem } from '@/components/projects/layout/project-sidebar-artifact-item';
import { ProjectSidebarThreadItem } from '@/components/projects/layout/project-sidebar-thread-item';
import { createArtifactDir, deleteArtifactDir, renameArtifactDir } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { useSessionsStore, useSidebarStore } from '@/stores';
import {
  appColors,
  appLayout,
  appListStyles,
  appSizes,
  appSpacing,
  appTypography,
} from '@/styles/ui';

const StyledFeather = withUniwind(Feather);
const PROJECT_ROUTE = '/[projectId]' as const;
const ARTIFACT_ROUTE = '/[projectId]/[artifactId]' as const;
const SHOW_SETTINGS_FOOTER = true;

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
      style={{ borderCurve: 'continuous', marginTop: 36 }}
    >
      <View
        className={cn(
          'flex-row items-center gap-4 px-4 py-3',
          appListStyles.sidebarItemSurface,
          isActive && appColors.surfaceDefault
        )}
      >
        <StyledFeather className="text-foreground" name="briefcase" size={appSizes.iconMd} />
        <AppText
          className="text-[16px] font-semibold text-foreground"
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {projectName ?? 'Project'}
        </AppText>
      </View>
    </Pressable>
  );
};

type SidebarSessionTarget = {
  artifactId: string;
  sessionId: string;
  sessionName: string;
};

type SidebarArtifactTarget = {
  artifactId: string;
  artifactName: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong.';
}

export const ProjectSidebarDrawer: FC<DrawerContentComponentProps> = (drawerProps) => {
  const router = useRouter();
  const params = useGlobalSearchParams<{
    artifactId?: string | string[];
    threadId?: string | string[];
  }>();
  const { projectId, refreshOverview } = useProjectShell();
  const { toast } = useToast();
  const [foregroundColor, mutedColor] = useThemeColor(['foreground', 'muted']);
  const projectName = useSidebarStore((state) => state.projectName);
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const isLoading = useSidebarStore((state) => state.isLoading);
  const isRefreshing = useSidebarStore((state) => state.isRefreshing);
  const error = useSidebarStore((state) => state.error);
  const addArtifactDir = useSidebarStore((state) => state.addArtifactDir);
  const sidebarRenameArtifactDir = useSidebarStore((state) => state.renameArtifactDir);
  const sidebarRemoveArtifactDir = useSidebarStore((state) => state.removeArtifactDir);
  const sidebarRenameSession = useSidebarStore((state) => state.renameSession);
  const sidebarRemoveSession = useSidebarStore((state) => state.removeSession);
  const renameSession = useSessionsStore((state) => state.renameSession);
  const deleteSession = useSessionsStore((state) => state.deleteSession);
  const renamingSessionId = useSessionsStore((state) => state.renamingSessionId);
  const insets = useSafeAreaInsets();
  const [settingsFooterHeight, setSettingsFooterHeight] = useState(
    insets.bottom + appSpacing.xxl + appSpacing.lg
  );
  const [expandedArtifacts, setExpandedArtifacts] = useState<Record<string, boolean>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
  const [isRenamingArtifact, setIsRenamingArtifact] = useState(false);
  const [renameArtifactTarget, setRenameArtifactTarget] = useState<SidebarArtifactTarget | null>(
    null
  );
  const [renameTarget, setRenameTarget] = useState<SidebarSessionTarget | null>(null);
  const activeArtifactId = Array.isArray(params.artifactId)
    ? params.artifactId[0]
    : params.artifactId;
  const activeThreadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const isProjectActive = !activeArtifactId && !activeThreadId;
  const hasExpandedArtifacts = Object.values(expandedArtifacts).some(Boolean);

  const handleCreateArtifact = async (name: string) => {
    setIsCreatingArtifact(true);

    try {
      const artifact = await createArtifactDir(projectId, { name });

      addArtifactDir(artifact);
      void refreshOverview('refresh');
      drawerProps.navigation.closeDrawer();
      toast.show({
        label: 'Artifact created',
        description: `${artifact.name} is ready.`,
      });
      router.replace({
        pathname: ARTIFACT_ROUTE,
        params: {
          projectId,
          artifactId: artifact.id,
        },
      });
    } finally {
      setIsCreatingArtifact(false);
    }
  };

  const handleOpenRenameSession = (target: SidebarSessionTarget) => {
    setRenameTarget(target);
  };

  const handleOpenRenameArtifact = (target: SidebarArtifactTarget) => {
    setRenameArtifactTarget(target);
  };

  const handleRenameArtifact = async (name: string) => {
    if (!renameArtifactTarget) {
      return;
    }

    const previousName = renameArtifactTarget.artifactName;

    sidebarRenameArtifactDir(renameArtifactTarget.artifactId, name);
    setIsRenamingArtifact(true);

    try {
      await renameArtifactDir(projectId, renameArtifactTarget.artifactId, { name });
      toast.show({
        label: 'Artifact renamed',
        description: `${previousName} is now ${name}.`,
      });
    } catch (renameError) {
      sidebarRenameArtifactDir(renameArtifactTarget.artifactId, previousName);
      toast.show({
        variant: 'danger',
        label: 'Rename failed',
        description: getErrorMessage(renameError),
      });
      throw renameError;
    } finally {
      setIsRenamingArtifact(false);
    }
  };

  const confirmDeleteArtifact = async (target: SidebarArtifactTarget) => {
    sidebarRemoveArtifactDir(target.artifactId);

    try {
      await deleteArtifactDir(projectId, target.artifactId);
      toast.show({
        label: 'Artifact deleted',
        description: `${target.artifactName} has been removed.`,
      });

      if (activeArtifactId === target.artifactId) {
        drawerProps.navigation.closeDrawer();
        router.replace({
          pathname: PROJECT_ROUTE,
          params: { projectId },
        });
      }
    } catch (deleteError) {
      await refreshOverview('refresh');
      toast.show({
        variant: 'danger',
        label: 'Delete failed',
        description: getErrorMessage(deleteError),
      });
    }
  };

  const handleDeleteArtifact = (target: SidebarArtifactTarget) => {
    Alert.alert('Delete artifact', `Delete ${target.artifactName}? This action cannot be undone.`, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDeleteArtifact(target);
        },
      },
    ]);
  };

  const handleArtifactOptions = (target: SidebarArtifactTarget) => {
    Alert.alert(target.artifactName, 'Choose an action for this artifact.', [
      {
        text: 'Rename',
        onPress: () => {
          handleOpenRenameArtifact(target);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          handleDeleteArtifact(target);
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  const handleRenameSession = async (name: string) => {
    if (!renameTarget) {
      return;
    }

    const previousName = renameTarget.sessionName;

    sidebarRenameSession(renameTarget.sessionId, name);

    try {
      await renameSession(
        {
          projectId,
          artifactId: renameTarget.artifactId,
        },
        {
          sessionId: renameTarget.sessionId,
          sessionName: name,
        }
      );

      toast.show({
        label: 'Thread renamed',
        description: `${previousName} is now ${name}.`,
      });
    } catch (renameError) {
      sidebarRenameSession(renameTarget.sessionId, previousName);
      toast.show({
        variant: 'danger',
        label: 'Rename failed',
        description: getErrorMessage(renameError),
      });
      throw renameError;
    }
  };

  const confirmDeleteSession = async (target: SidebarSessionTarget) => {
    sidebarRemoveSession(target.artifactId, target.sessionId);

    try {
      await deleteSession(
        {
          projectId,
          artifactId: target.artifactId,
        },
        target.sessionId
      );

      toast.show({
        label: 'Thread deleted',
        description: `${target.sessionName} has been removed.`,
      });

      if (activeThreadId === target.sessionId) {
        drawerProps.navigation.closeDrawer();
        router.replace({
          pathname: ARTIFACT_ROUTE,
          params: {
            projectId,
            artifactId: target.artifactId,
          },
        });
      }
    } catch (deleteError) {
      await refreshOverview('refresh');
      toast.show({
        variant: 'danger',
        label: 'Delete failed',
        description: getErrorMessage(deleteError),
      });
    }
  };

  const handleDeleteSession = (target: SidebarSessionTarget) => {
    Alert.alert('Delete thread', `Delete ${target.sessionName}? This action cannot be undone.`, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDeleteSession(target);
        },
      },
    ]);
  };

  const handleSessionOptions = (target: SidebarSessionTarget) => {
    Alert.alert(target.sessionName, 'Choose an action for this thread.', [
      {
        text: 'Rename',
        onPress: () => {
          handleOpenRenameSession(target);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          handleDeleteSession(target);
        },
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ]);
  };

  return (
    <>
      <View className={cn('relative flex-1', appColors.background)}>
        <View
          className={appColors.background}
          style={{
            paddingTop: insets.top,
            paddingHorizontal: appSpacing.md,
          }}
        >
          <Button
            accessibilityLabel="Back to all projects"
            className="self-start rounded-full px-2"
            size="sm"
            variant="ghost"
            onPress={() => {
              drawerProps.navigation.closeDrawer();
              router.replace('/');
            }}
          >
            <StyledFeather className={'text-foreground'} name="chevron-left" size={28} />
          </Button>

          <ProjectNameSidebarItem
            isActive={isProjectActive}
            projectName={projectName}
            onPress={() => {
              drawerProps.navigation.closeDrawer();
              router.replace({
                pathname: PROJECT_ROUTE,
                params: { projectId },
              });
            }}
          />
          <View className={appLayout.sidebarSectionHeader}>
            <AppText className={appTypography.sidebarSectionLabel}>Artifacts</AppText>
            <Button
              accessibilityLabel="Create artifact"
              className="rounded-full pt-1"
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={() => setIsCreateOpen(true)}
            >
              <PlusIcon color={foregroundColor} size={14} />
            </Button>
          </View>
        </View>

        <ScrollView
          alwaysBounceVertical
          className={cn('flex-1', appColors.background)}
          contentInsetAdjustmentBehavior="never"
          style={{ marginBottom: SHOW_SETTINGS_FOOTER ? settingsFooterHeight : 0 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: appSpacing.md,
            paddingTop: appSpacing.xs,
            paddingBottom: appSpacing.md,
          }}
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
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-1">
            {error && artifactDirs.length === 0 ? (
              <AppText className={appTypography.body}>{error}</AppText>
            ) : null}

            {isLoading && artifactDirs.length === 0 ? (
              <AppText className={appTypography.bodyMuted}>Loading artifacts…</AppText>
            ) : null}

            {!isLoading && !error && artifactDirs.length === 0 ? (
              <AppText className={appTypography.bodyMuted}>No artifacts yet.</AppText>
            ) : null}

            {artifactDirs.map((artifact) => {
              const isArtifactActive = activeArtifactId === artifact.id && !activeThreadId;
              const isExpanded = expandedArtifacts[artifact.id] ?? activeArtifactId === artifact.id;

              return (
                <View key={artifact.id}>
                  <ProjectSidebarArtifactItem
                    expanded={isExpanded}
                    isActive={isArtifactActive}
                    label={artifact.name}
                    onContextMenuPress={() =>
                      handleArtifactOptions({
                        artifactId: artifact.id,
                        artifactName: artifact.name,
                      })
                    }
                    onDeletePress={() =>
                      handleDeleteArtifact({
                        artifactId: artifact.id,
                        artifactName: artifact.name,
                      })
                    }
                    onOpenPress={() => {
                      drawerProps.navigation.closeDrawer();
                      router.replace({
                        pathname: ARTIFACT_ROUTE,
                        params: {
                          projectId,
                          artifactId: artifact.id,
                        },
                      });
                    }}
                    onRenamePress={() =>
                      handleOpenRenameArtifact({
                        artifactId: artifact.id,
                        artifactName: artifact.name,
                      })
                    }
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
                        <ProjectSidebarThreadItem
                          key={session.sessionId}
                          isActive={activeThreadId === session.sessionId}
                          label={session.sessionName}
                          onContextMenuPress={() =>
                            handleSessionOptions({
                              artifactId: artifact.id,
                              sessionId: session.sessionId,
                              sessionName: session.sessionName,
                            })
                          }
                          onDeletePress={() =>
                            handleDeleteSession({
                              artifactId: artifact.id,
                              sessionId: session.sessionId,
                              sessionName: session.sessionName,
                            })
                          }
                          onOpenPress={() => {
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
                          onRenamePress={() =>
                            handleOpenRenameSession({
                              artifactId: artifact.id,
                              sessionId: session.sessionId,
                              sessionName: session.sessionName,
                            })
                          }
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}

            <View
              pointerEvents="none"
              style={{
                height: hasExpandedArtifacts ? insets.bottom + appSpacing.xxl : appSpacing.md,
              }}
            />
          </View>
        </ScrollView>

        {SHOW_SETTINGS_FOOTER ? (
          <ProjectDrawerSettingsSheet onHeightChange={setSettingsFooterHeight} />
        ) : null}
      </View>

      <CreateArtifactDialog
        isCreating={isCreatingArtifact}
        isOpen={isCreateOpen}
        onCreate={handleCreateArtifact}
        onOpenChange={setIsCreateOpen}
      />

      <RenameArtifactDialog
        initialName={renameArtifactTarget?.artifactName ?? ''}
        isOpen={renameArtifactTarget !== null}
        isRenaming={isRenamingArtifact}
        onOpenChange={(open) => {
          if (!open) {
            setRenameArtifactTarget(null);
          }
        }}
        onRename={handleRenameArtifact}
      />

      <RenameSessionDialog
        initialName={renameTarget?.sessionName ?? ''}
        isOpen={renameTarget !== null}
        isRenaming={renameTarget !== null && renamingSessionId === renameTarget.sessionId}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onRename={handleRenameSession}
      />
    </>
  );
};
