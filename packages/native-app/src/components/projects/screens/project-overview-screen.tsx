import Feather from '@expo/vector-icons/Feather';
import { Link, useRouter } from 'expo-router';
import { Button, InputGroup, useThemeColor, useToast } from 'heroui-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { withUniwind } from 'uniwind';


import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { CreateArtifactDialog } from '@/components/projects/dialogs/create-artifact-dialog';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import { createArtifactDir } from '@/lib/client-api';
import { useSidebarStore } from '@/stores';
import {
  appColors,
  appInputStyles,
  appLayout,
  appListStyles,
  appSizes,
  appSpacing,
  appTypography,
} from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

export function ProjectOverviewScreen() {
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const isLoading = useSidebarStore((state) => state.isLoading);
  const error = useSidebarStore((state) => state.error);
  const addArtifactDir = useSidebarStore((state) => state.addArtifactDir);
  const { projectId, refreshOverview } = useProjectShell();
  const router = useRouter();
  const { toast } = useToast();
  const [foregroundColor] = useThemeColor(['foreground']);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
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
        variant: 'success',
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

  return (
    <>
      <ScreenScrollView
        contentContainerClassName={appLayout.screenContent}
        contentContainerStyle={{
          paddingTop: appSpacing.md,
          paddingBottom: appSpacing.screenBottomOffset,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
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

        <View className={appLayout.sectionBlock} style={{ paddingTop: appSpacing.sm }}>
          <View className={appLayout.homeHeaderRow}>
            <AppText className={appTypography.sectionLabel}>Artifacts</AppText>
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

          <View className={appLayout.compactList}>
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
              <Link
                key={artifact.id}
                asChild
                href={{
                  pathname: '/[projectId]/[artifactId]',
                  params: {
                    projectId,
                    artifactId: artifact.id,
                  },
                }}
              >
                <Pressable
                  android_ripple={{ color: 'transparent' }}
                  style={{ borderCurve: 'continuous' }}
                >
                  <View className={appListStyles.filesystemRow}>
                    <StyledFeather
                      className={appColors.foregroundMuted}
                      name="folder"
                      size={appSizes.iconMd}
                    />
                    <View className={appListStyles.rowContent}>
                      <AppText className={appTypography.listTitle}>{artifact.name}</AppText>
                    </View>
                    <View className={appListStyles.rowRight}>
                      <AppText className={appTypography.listCount}>
                        {artifact.sessions.length}
                      </AppText>
                      <StyledFeather
                        className={appColors.foregroundSoft}
                        name="chevron-right"
                        size={appSizes.iconXs}
                      />
                    </View>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      </ScreenScrollView>

      <CreateArtifactDialog
        isCreating={isCreatingArtifact}
        isOpen={isCreateOpen}
        onCreate={handleCreateArtifact}
        onOpenChange={setIsCreateOpen}
      />
    </>
  );
}
