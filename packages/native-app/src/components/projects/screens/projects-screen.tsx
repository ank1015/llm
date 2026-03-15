import Feather from '@expo/vector-icons/Feather';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, useThemeColor, useToast } from 'heroui-native';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ProjectDto } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { ProjectCard } from '@/components/projects/cards/project-card';
import { ProjectCardSkeleton } from '@/components/projects/cards/project-card-base';
import { CreateProjectDialog } from '@/components/projects/dialogs/create-project-dialog';
import { RenameProjectDialog } from '@/components/projects/dialogs/rename-project-dialog';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useProjectsStore } from '@/stores';
import {
  appCardStyles,
  appColors,
  appLayout,
  appSizes,
  appSpacing,
  appStateStyles,
  appTypography,
  getSurfaceCardClassName,
} from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong.';
}

export function ProjectsScreen() {
  const projects = useProjectsStore((state) => state.projects);
  const isLoading = useProjectsStore((state) => state.isLoading);
  const isRefreshing = useProjectsStore((state) => state.isRefreshing);
  const error = useProjectsStore((state) => state.error);
  const isCreating = useProjectsStore((state) => state.isCreating);
  const renamingProjectId = useProjectsStore((state) => state.renamingProjectId);
  const fetchProjects = useProjectsStore((state) => state.fetchProjects);
  const refreshProjects = useProjectsStore((state) => state.refresh);
  const createProject = useProjectsStore((state) => state.createProject);
  const renameProject = useProjectsStore((state) => state.renameProject);
  const deleteProject = useProjectsStore((state) => state.deleteProject);

  const { isDark } = useAppTheme();
  const [foregroundColor, mutedColor] = useThemeColor(['foreground', 'muted']);
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectDto | null>(null);
  const shouldShowProjectSkeletons = projects.length === 0 && !error && (isLoading || isRefreshing);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleOpenProject = (project: ProjectDto) => {
    router.replace({
      pathname: '/[projectId]',
      params: {
        projectId: project.id,
      },
    });
  };

  const handleCreateProject = async (name: string) => {
    const project = await createProject({ name });

    toast.show({
      label: 'Project created',
      description: `${project.name} is ready.`,
    });

    router.replace({
      pathname: '/[projectId]',
      params: {
        projectId: project.id,
      },
    });
  };

  const handleOpenRenameProject = (project: ProjectDto) => {
    setRenameTarget(project);
  };

  const handleRenameProject = async (name: string) => {
    if (!renameTarget) {
      return;
    }

    const previousName = renameTarget.name;

    try {
      await renameProject(renameTarget.id, { name });
      toast.show({
        label: 'Project renamed',
        description: `${previousName} is now ${name}.`,
      });
    } catch (renameError) {
      toast.show({
        variant: 'danger',
        label: 'Rename failed',
        description: getErrorMessage(renameError),
      });
      throw renameError;
    }
  };

  const confirmDeleteProject = async (project: ProjectDto) => {
    try {
      await deleteProject(project.id);
      toast.show({
        label: 'Project deleted',
        description: `${project.name} has been removed.`,
      });
    } catch (deleteError) {
      toast.show({
        variant: 'danger',
        label: 'Delete failed',
        description: getErrorMessage(deleteError),
      });
    }
  };

  const handleDeleteProject = (project: ProjectDto) => {
    Alert.alert('Delete project', `Delete ${project.name}? This action cannot be undone.`, [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void confirmDeleteProject(project);
        },
      },
    ]);
  };

  const handleProjectOptions = (project: ProjectDto) => {
    Alert.alert(project.name, 'Choose an action for this project.', [
      {
        text: 'Rename',
        onPress: () => {
          handleOpenRenameProject(project);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          handleDeleteProject(project);
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
      <Stack.Screen options={{ headerShown: false }} />

      <View className="flex-1 bg-background">
        <View
          className={appLayout.screenHorizontalPadding}
          style={{
            paddingTop: insets.top + appSpacing.screenTopOffset,
            paddingBottom: appSpacing.xxl,
          }}
        >
          <View className={appLayout.homeHeaderRow}>
            <AppText
              className={appTypography.screenTitle}
              style={{ minWidth: 132, paddingRight: 8 }}
            >
              Projects
            </AppText>
            <Button
              className="rounded-full"
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={() => setIsCreateOpen(true)}
            >
              <PlusIcon color={foregroundColor} size={appSizes.iconXs} />
            </Button>
          </View>
        </View>

        <ScreenScrollView
          alwaysBounceVertical
          className="flex-1"
          contentContainerClassName={appLayout.screenContent}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + appSpacing.screenBottomOffset,
          }}
          refreshControl={
            <RefreshControl
              colors={[mutedColor]}
              onRefresh={() => {
                void refreshProjects();
              }}
              refreshing={isRefreshing}
              tintColor={mutedColor}
            />
          }
        >
          {error ? (
            <Card className={getSurfaceCardClassName(isDark)}>
              <Card.Body className={appCardStyles.defaultBody}>
                <View className={appLayout.statusRow}>
                  <View className={appStateStyles.alertBadge}>
                    <StyledFeather
                      className={appColors.dangerForeground}
                      name="alert-circle"
                      size={appSizes.iconSm}
                    />
                  </View>
                  <View className={appLayout.textStack}>
                    <AppText className={appTypography.bodyStrong}>
                      Couldn&apos;t load projects
                    </AppText>
                    <AppText selectable className={appTypography.body}>
                      {error}
                    </AppText>
                  </View>
                </View>
                <Button
                  className="self-start"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    void fetchProjects();
                  }}
                >
                  <Button.Label>Retry</Button.Label>
                </Button>
              </Card.Body>
            </Card>
          ) : null}

          {shouldShowProjectSkeletons ? (
            <View className={appLayout.projectList}>
              {Array.from({ length: 4 }).map((_, index) => (
                <ProjectCardSkeleton key={`project-skeleton-${index}`} index={index} />
              ))}
            </View>
          ) : null}

          {!shouldShowProjectSkeletons && !error && projects.length === 0 ? (
            <Card className={getSurfaceCardClassName(isDark)}>
              <Card.Body className={appCardStyles.emptyBody}>
                <View className={appStateStyles.emptyBadge}>
                  <StyledFeather
                    className={appColors.foregroundMuted}
                    name="folder"
                    size={appSizes.iconLg}
                  />
                </View>
                <View className={appLayout.centeredStack}>
                  <AppText className={appTypography.sectionTitle}>No projects yet</AppText>
                  <AppText className={appTypography.bodyCentered}>
                    Create your first project to start working with the native app.
                  </AppText>
                </View>
                <Button onPress={() => setIsCreateOpen(true)}>
                  <Button.Label>Create project</Button.Label>
                </Button>
              </Card.Body>
            </Card>
          ) : null}

          {projects.length > 0 ? (
            <View className={appLayout.projectList}>
              {projects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  index={index}
                  onContextMenuPress={() => handleProjectOptions(project)}
                  onDeletePress={() => handleDeleteProject(project)}
                  onOpenPress={() => handleOpenProject(project)}
                  onRenamePress={() => handleOpenRenameProject(project)}
                  project={project}
                />
              ))}
            </View>
          ) : null}
        </ScreenScrollView>
      </View>

      <CreateProjectDialog
        isCreating={isCreating}
        isOpen={isCreateOpen}
        onCreate={handleCreateProject}
        onOpenChange={setIsCreateOpen}
      />

      <RenameProjectDialog
        initialName={renameTarget?.name ?? ''}
        isOpen={renameTarget !== null}
        isRenaming={renameTarget !== null && renamingProjectId === renameTarget.id}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onRename={handleRenameProject}
      />
    </>
  );
}
