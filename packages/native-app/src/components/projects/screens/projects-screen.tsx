import Feather from '@expo/vector-icons/Feather';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Spinner, useThemeColor, useToast } from 'heroui-native';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ProjectMetadata } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { ProjectCard } from '@/components/projects/cards/project-card';
import { CreateProjectDialog } from '@/components/projects/dialogs/create-project-dialog';
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
  const fetchProjects = useProjectsStore((state) => state.fetchProjects);
  const refreshProjects = useProjectsStore((state) => state.refresh);
  const createProject = useProjectsStore((state) => state.createProject);
  const deleteProject = useProjectsStore((state) => state.deleteProject);

  const { isDark } = useAppTheme();
  const [accentColor, foregroundColor] = useThemeColor(['accent', 'foreground']);
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleOpenProject = (project: ProjectMetadata) => {
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
      variant: 'success',
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

  const confirmDeleteProject = async (project: ProjectMetadata) => {
    try {
      await deleteProject(project.id);
      toast.show({
        variant: 'success',
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

  const handleDeleteProject = (project: ProjectMetadata) => {
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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenScrollView
        contentContainerClassName={appLayout.screenContent}
        contentContainerStyle={{
          paddingTop: insets.top + appSpacing.screenTopOffset,
          paddingBottom: insets.bottom + appSpacing.screenBottomOffset,
        }}
        refreshControl={
          <RefreshControl
            colors={[accentColor]}
            onRefresh={() => {
              void refreshProjects();
            }}
            refreshing={isRefreshing}
            tintColor={accentColor}
          />
        }
      >
        <View className={appLayout.homeHeaderRow}>
          <AppText className={appTypography.screenTitle}>Projects</AppText>
          <Button isIconOnly size="sm" variant="secondary" onPress={() => setIsCreateOpen(true)}>
            <PlusIcon color={foregroundColor} size={appSizes.iconXs} />
          </Button>
        </View>

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

        {isLoading && projects.length === 0 ? (
          <Card className={getSurfaceCardClassName(isDark)}>
            <Card.Body className={appCardStyles.loadingBody}>
              <Spinner size="lg" />
              <AppText className={appTypography.bodyMuted}>Loading projects…</AppText>
            </Card.Body>
          </Card>
        ) : null}

        {!isLoading && !error && projects.length === 0 ? (
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
                onLongPress={() => handleDeleteProject(project)}
                onOpenPress={() => handleOpenProject(project)}
                project={project}
              />
            ))}
          </View>
        ) : null}
      </ScreenScrollView>

      <CreateProjectDialog
        isCreating={isCreating}
        isOpen={isCreateOpen}
        onCreate={handleCreateProject}
        onOpenChange={setIsCreateOpen}
      />
    </>
  );
}
