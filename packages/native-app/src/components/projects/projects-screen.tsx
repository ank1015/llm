import Feather from '@expo/vector-icons/Feather';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Spinner, cn, useThemeColor, useToast } from 'heroui-native';
import { useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ProjectMetadata } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { CreateProjectDialog } from '@/components/projects/create-project-dialog';
import { ProjectCard } from '@/components/projects/project-card';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useProjectsStore } from '@/stores';

const StyledFeather = withUniwind(Feather);
const darkBorderClassName = 'border-zinc-900';
const surfaceCardClassName = 'border border-zinc-200 shadow-none';

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
  const accentColor = useThemeColor('accent');
  const { toast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const handleOpenProject = (project: ProjectMetadata) => {
    router.push({
      pathname: '/app/[projectId]',
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

    router.push({
      pathname: '/app/[projectId]',
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
        contentContainerClassName="gap-4"
        contentContainerStyle={{
          paddingTop: insets.top + 34,
          paddingBottom: insets.bottom + 32,
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
        <View className="flex-row items-center justify-between gap-4 px-1">
          <AppText className="text-[26px] font-semibold tracking-tight text-foreground">
            Projects
          </AppText>
          <Button isIconOnly size="sm" variant="secondary" onPress={() => setIsCreateOpen(true)}>
            <PlusIcon size={16} colorClassName="accent-accent" />
          </Button>
        </View>

        {error ? (
          <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
            <Card.Body className="gap-3 p-4">
              <View className="flex-row items-start gap-3">
                <View className="size-10 items-center justify-center rounded-3xl bg-red-500/10">
                  <StyledFeather className="text-red-500" name="alert-circle" size={18} />
                </View>
                <View className="flex-1 gap-1">
                  <AppText className="text-sm font-semibold text-foreground">
                    Couldn&apos;t load projects
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
                  void fetchProjects();
                }}
              >
                <Button.Label>Retry</Button.Label>
              </Button>
            </Card.Body>
          </Card>
        ) : null}

        {isLoading && projects.length === 0 ? (
          <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
            <Card.Body className="items-center gap-3 p-6">
              <Spinner size="lg" />
              <AppText className="text-sm text-muted">Loading projects…</AppText>
            </Card.Body>
          </Card>
        ) : null}

        {!isLoading && !error && projects.length === 0 ? (
          <Card className={cn(surfaceCardClassName, isDark && darkBorderClassName)}>
            <Card.Body className="items-center gap-4 p-6">
              <View className="size-14 items-center justify-center rounded-full bg-foreground/5">
                <StyledFeather className="text-foreground/70" name="folder" size={22} />
              </View>
              <View className="items-center gap-1">
                <AppText className="text-base font-semibold text-foreground">
                  No projects yet
                </AppText>
                <AppText className="text-center text-sm leading-5 text-muted">
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
          <View className="mt-5 gap-4">
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
