import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { Button, InputGroup, useThemeColor, useToast } from 'heroui-native';
import { useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { CreateArtifactDialog } from '@/components/projects/dialogs/create-artifact-dialog';
import { RenameArtifactDialog } from '@/components/projects/dialogs/rename-artifact-dialog';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ProjectOverviewArtifactItem } from '@/components/projects/screens/project-overview-artifact-item';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { createArtifactDir, deleteArtifactDir, renameArtifactDir } from '@/lib/client-api';
import { useSidebarStore } from '@/stores';
import { appInputStyles, appLayout, appSizes, appSpacing, appTypography } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

type OverviewArtifactTarget = {
  artifactId: string;
  artifactName: string;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Something went wrong.';
}

export function ProjectOverviewScreen() {
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const isLoading = useSidebarStore((state) => state.isLoading);
  const isRefreshing = useSidebarStore((state) => state.isRefreshing);
  const error = useSidebarStore((state) => state.error);
  const addArtifactDir = useSidebarStore((state) => state.addArtifactDir);
  const sidebarRenameArtifactDir = useSidebarStore((state) => state.renameArtifactDir);
  const sidebarRemoveArtifactDir = useSidebarStore((state) => state.removeArtifactDir);
  const { projectId, refreshOverview } = useProjectShell();
  const router = useRouter();
  const { toast } = useToast();
  const [foregroundColor, mutedColor] = useThemeColor(['foreground', 'muted']);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
  const [isRenamingArtifact, setIsRenamingArtifact] = useState(false);
  const [renameArtifactTarget, setRenameArtifactTarget] = useState<OverviewArtifactTarget | null>(
    null
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredArtifacts = normalizedSearchQuery
    ? artifactDirs.filter((artifact) => {
        const description = artifact.description?.toLowerCase() ?? '';
        return (
          artifact.name.toLowerCase().includes(normalizedSearchQuery) ||
          description.includes(normalizedSearchQuery)
        );
      })
    : artifactDirs;

  const handleCreateArtifact = async (name: string) => {
    setIsCreatingArtifact(true);

    try {
      const artifact = await createArtifactDir(projectId, { name });

      addArtifactDir(artifact);
      void refreshOverview('refresh');
      toast.show({
        label: 'Artifact created',
        description: `${artifact.name} is ready.`,
      });
      router.replace({
        pathname: '/[projectId]/[artifactId]',
        params: {
          projectId,
          artifactId: artifact.id,
        },
      });
    } finally {
      setIsCreatingArtifact(false);
    }
  };

  const handleOpenRenameArtifact = (target: OverviewArtifactTarget) => {
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

  const confirmDeleteArtifact = async (target: OverviewArtifactTarget) => {
    sidebarRemoveArtifactDir(target.artifactId);

    try {
      await deleteArtifactDir(projectId, target.artifactId);
      toast.show({
        label: 'Artifact deleted',
        description: `${target.artifactName} has been removed.`,
      });
    } catch (deleteError) {
      await refreshOverview('refresh');
      toast.show({
        variant: 'danger',
        label: 'Delete failed',
        description: getErrorMessage(deleteError),
      });
    }
  };

  const handleDeleteArtifact = (target: OverviewArtifactTarget) => {
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

  const handleArtifactOptions = (target: OverviewArtifactTarget) => {
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

  return (
    <>
      <ScreenScrollView
        alwaysBounceVertical
        contentContainerClassName={appLayout.screenContent}
        contentContainerStyle={{
          paddingTop: appSpacing.md,
          paddingBottom: appSpacing.screenBottomOffset,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
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
      >
        <InputGroup>
          <InputGroup.Prefix isDecorative>
            <StyledFeather className={appInputStyles.icon} name="search" size={appSizes.iconLg} />
          </InputGroup.Prefix>
          <InputGroup.Input
            accessibilityLabel="Search artifacts"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            clearButtonMode="while-editing"
            className={appInputStyles.searchField}
            onChangeText={setSearchQuery}
            placeholder="Search artifacts"
            placeholderColorClassName={appInputStyles.placeholder}
            returnKeyType="search"
            spellCheck={false}
            style={{
              borderCurve: 'continuous',
              paddingRight: appSpacing.lg,
            }}
            textAlignVertical="center"
            value={searchQuery}
            variant="secondary"
          />
        </InputGroup>

        <View className="gap-5" style={{ paddingTop: appSpacing.sm }}>
          <View className={appLayout.homeHeaderRow}>
            <AppText className="px-1 text-base font-semibold text-muted">Artifacts</AppText>
            <Button
              accessibilityLabel="Create artifact"
              className="rounded-full"
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={() => setIsCreateOpen(true)}
            >
              <PlusIcon color={foregroundColor} size={appSizes.iconXs} />
            </Button>
          </View>

          <View className="gap-5" style={{ paddingTop: appSpacing.xs }}>
            {error && artifactDirs.length === 0 ? (
              <AppText className={appTypography.body}>{error}</AppText>
            ) : null}

            {isLoading && artifactDirs.length === 0 ? (
              <AppText className={appTypography.bodyMuted}>Loading artifacts…</AppText>
            ) : null}

            {!isLoading && !error && artifactDirs.length === 0 ? (
              <AppText className={appTypography.bodyMuted}>No artifacts yet.</AppText>
            ) : null}

            {!isLoading && artifactDirs.length > 0 && filteredArtifacts.length === 0 ? (
              <AppText className={appTypography.bodyMuted}>No matching artifacts.</AppText>
            ) : null}

            {filteredArtifacts.map((artifact) => (
              <ProjectOverviewArtifactItem
                key={artifact.id}
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
                onOpenPress={() =>
                  router.replace({
                    pathname: '/[projectId]/[artifactId]',
                    params: {
                      projectId,
                      artifactId: artifact.id,
                    },
                  })
                }
                onRenamePress={() =>
                  handleOpenRenameArtifact({
                    artifactId: artifact.id,
                    artifactName: artifact.name,
                  })
                }
                sessionCount={artifact.sessions.length}
              />
            ))}
          </View>
        </View>
      </ScreenScrollView>

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

      <CreateArtifactDialog
        isCreating={isCreatingArtifact}
        isOpen={isCreateOpen}
        onCreate={handleCreateArtifact}
        onOpenChange={setIsCreateOpen}
      />
    </>
  );
}
