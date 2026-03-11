import Feather from '@expo/vector-icons/Feather';
import { FlashList } from '@shopify/flash-list';
import { Button, Spinner, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ArtifactExplorerEntry } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { ArtifactFileViewer } from '@/components/projects/artifacts/artifact-file-viewer';
import {
  getPathExtension,
  getViewerKind,
  normalizeRelativePath,
} from '@/components/projects/artifacts/artifact-file-viewer-shared';
import { cn } from '@/lib/utils';
import { useArtifactFilesStore, useSidebarStore } from '@/stores';
import { appColors, appListStyles, appSizes, appSpacing, appTypography } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

type ProjectArtifactExplorerProps = {
  artifactId: string;
  projectId: string;
};

type BreadcrumbItem = {
  label: string;
  path: string;
};

type VisibleBreadcrumbItem =
  | ({ kind: 'crumb' } & BreadcrumbItem)
  | {
      kind: 'ellipsis';
      key: string;
    };

function getArtifactKey(projectId: string, artifactId: string): string {
  return `${projectId}::${artifactId}`;
}

function getDirectoryRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::dir::${path}`;
}

function getFileRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::file::${path}`;
}

function buildBreadcrumbs(rootLabel: string, path: string): BreadcrumbItem[] {
  const safePath = normalizeRelativePath(path);
  const items: BreadcrumbItem[] = [{ label: rootLabel, path: '' }];

  if (!safePath) {
    return items;
  }

  const segments = safePath.split('/');
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    items.push({
      label: segment,
      path: currentPath,
    });
  }

  return items;
}

function estimateBreadcrumbWidth(label: string, isCurrent: boolean): number {
  const safeLength = Math.min(label.length, 28);
  return safeLength * (isCurrent ? 8.4 : 7.2) + 12;
}

function getVisibleBreadcrumbs(
  items: BreadcrumbItem[],
  availableWidth: number
): VisibleBreadcrumbItem[] {
  if (items.length === 0) {
    return [];
  }

  if (items.length === 1) {
    return [{ kind: 'crumb', ...items[0] }];
  }

  const separatorWidth = 16;
  let remainingWidth = Math.max(availableWidth, 140);
  const includedIndexes = new Set<number>();
  const lastIndex = items.length - 1;

  includedIndexes.add(lastIndex);
  remainingWidth -= estimateBreadcrumbWidth(items[lastIndex].label, true);

  const rootWidth = separatorWidth + estimateBreadcrumbWidth(items[0].label, false);
  if (remainingWidth >= rootWidth * 0.65) {
    includedIndexes.add(0);
    remainingWidth -= rootWidth;
  }

  for (let index = lastIndex - 1; index >= 1; index -= 1) {
    const nextWidth = separatorWidth + estimateBreadcrumbWidth(items[index].label, false);

    if (remainingWidth < nextWidth) {
      break;
    }

    includedIndexes.add(index);
    remainingWidth -= nextWidth;
  }

  const visibleItems: VisibleBreadcrumbItem[] = [];
  let previousIncludedIndex: number | null = null;

  for (let index = 0; index < items.length; index += 1) {
    if (!includedIndexes.has(index)) {
      continue;
    }

    if (previousIncludedIndex !== null && index - previousIncludedIndex > 1) {
      visibleItems.push({
        kind: 'ellipsis',
        key: `ellipsis:${previousIncludedIndex}:${index}`,
      });
    }

    if (previousIncludedIndex === null && index > 0) {
      visibleItems.push({
        kind: 'ellipsis',
        key: `ellipsis:start:${index}`,
      });
    }

    visibleItems.push({
      kind: 'crumb',
      ...items[index],
    });
    previousIncludedIndex = index;
  }

  return visibleItems;
}

function getEntryIcon(entry: ArtifactExplorerEntry): keyof typeof Feather.glyphMap {
  if (entry.type === 'directory') {
    return 'folder';
  }

  const extension = getPathExtension(entry.path);
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') {
    return 'file-text';
  }
  if (getViewerKind(entry.path, false) === 'image') {
    return 'image';
  }

  return 'file';
}

export function ProjectArtifactExplorer({ artifactId, projectId }: ProjectArtifactExplorerProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [foregroundColor] = useThemeColor(['foreground']);
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId) ?? null
  );
  const directoriesByArtifact = useArtifactFilesStore((state) => state.directoriesByArtifact);
  const filesByArtifact = useArtifactFilesStore((state) => state.filesByArtifact);
  const currentDirectoryPathByArtifact = useArtifactFilesStore(
    (state) => state.currentDirectoryPathByArtifact
  );
  const selectedFileByArtifact = useArtifactFilesStore((state) => state.selectedFileByArtifact);
  const navigationHistoryByArtifact = useArtifactFilesStore(
    (state) => state.navigationHistoryByArtifact
  );
  const directoryLoadingByKey = useArtifactFilesStore((state) => state.directoryLoadingByKey);
  const fileLoadingByKey = useArtifactFilesStore((state) => state.fileLoadingByKey);
  const directoryErrorByKey = useArtifactFilesStore((state) => state.directoryErrorByKey);
  const fileErrorByKey = useArtifactFilesStore((state) => state.fileErrorByKey);
  const pushNavigationState = useArtifactFilesStore((state) => state.pushNavigationState);
  const navigateHistory = useArtifactFilesStore((state) => state.navigateHistory);
  const loadDirectory = useArtifactFilesStore((state) => state.loadDirectory);
  const openFile = useArtifactFilesStore((state) => state.openFile);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const artifactKey = getArtifactKey(projectId, artifactId);
  const artifactCtx = { artifactId, projectId };
  const rootLabel = artifact?.name ?? 'Root';
  const currentDirectoryPath = currentDirectoryPathByArtifact[artifactKey] ?? '';
  const selectedFilePath = selectedFileByArtifact[artifactKey] ?? null;
  const currentDirectory = directoriesByArtifact[artifactKey]?.[currentDirectoryPath] ?? null;
  const selectedFile = selectedFilePath
    ? (filesByArtifact[artifactKey]?.[selectedFilePath] ?? null)
    : null;
  const directoryRequestKey = getDirectoryRequestKey(artifactKey, currentDirectoryPath);
  const fileRequestKey = selectedFilePath ? getFileRequestKey(artifactKey, selectedFilePath) : null;
  const isDirectoryLoading = directoryLoadingByKey[directoryRequestKey] ?? false;
  const isFileLoading = fileRequestKey ? (fileLoadingByKey[fileRequestKey] ?? false) : false;
  const directoryError = directoryErrorByKey[directoryRequestKey] ?? null;
  const fileError = fileRequestKey ? (fileErrorByKey[fileRequestKey] ?? null) : null;
  const navigationHistory = navigationHistoryByArtifact[artifactKey] ?? null;
  const fileViewerKind = selectedFile
    ? getViewerKind(selectedFile.path, selectedFile.isBinary)
    : null;
  const navigationPath = selectedFilePath ?? currentDirectoryPath;
  const breadcrumbItems = buildBreadcrumbs(rootLabel, navigationPath);
  const breadcrumbAvailableWidth = Math.max(
    width - appSpacing.screenHorizontalPadding * 2 - 112,
    120
  );
  const visibleBreadcrumbItems = getVisibleBreadcrumbs(breadcrumbItems, breadcrumbAvailableWidth);
  const canGoBack = navigationHistory ? navigationHistory.index > 0 : false;
  const canGoForward = navigationHistory
    ? navigationHistory.index < navigationHistory.entries.length - 1
    : false;

  useEffect(() => {
    if (!artifactId) {
      return;
    }

    if (navigationHistoryByArtifact[artifactKey]) {
      return;
    }

    pushNavigationState(
      { artifactId, projectId },
      {
        directoryPath: currentDirectoryPath,
        filePath: selectedFilePath,
      }
    );
  }, [
    artifactId,
    artifactKey,
    currentDirectoryPath,
    navigationHistoryByArtifact,
    projectId,
    pushNavigationState,
    selectedFilePath,
  ]);

  useEffect(() => {
    if (!artifactId) {
      return;
    }

    void loadDirectory({ artifactId, projectId }, currentDirectoryPath).catch(() => undefined);
  }, [artifactId, currentDirectoryPath, loadDirectory, projectId]);

  useEffect(() => {
    if (!artifactId || !selectedFilePath || selectedFile) {
      return;
    }

    void openFile({ artifactId, projectId }, selectedFilePath).catch(() => undefined);
  }, [artifactId, openFile, projectId, selectedFile, selectedFilePath]);

  const handleRefresh = async () => {
    if (!artifactId) {
      return;
    }

    setIsRefreshing(true);

    try {
      if (selectedFilePath) {
        await Promise.all([
          loadDirectory(artifactCtx, currentDirectoryPath, true),
          openFile(artifactCtx, selectedFilePath, true),
        ]);
      } else {
        await loadDirectory(artifactCtx, currentDirectoryPath, true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDirectoryPress = (path: string) => {
    if (!artifactId) {
      return;
    }

    const safePath = normalizeRelativePath(path);
    pushNavigationState(artifactCtx, {
      directoryPath: safePath,
      filePath: null,
    });
    void loadDirectory(artifactCtx, safePath).catch(() => undefined);
  };

  const handleFilePress = (path: string) => {
    if (!artifactId) {
      return;
    }

    const safePath = normalizeRelativePath(path);
    pushNavigationState(artifactCtx, {
      directoryPath: currentDirectoryPath,
      filePath: safePath,
    });
  };

  const handleHistoryNavigation = (direction: 'back' | 'forward') => {
    if (!artifactId) {
      return;
    }

    const nextLocation = navigateHistory(artifactCtx, direction);

    if (!nextLocation) {
      return;
    }

    void loadDirectory(artifactCtx, nextLocation.directoryPath).catch(() => undefined);
  };

  const renderDirectoryEmptyState = () => {
    if (isDirectoryLoading) {
      return (
        <View className="flex-1 items-center justify-center gap-3 px-6 py-16">
          <Spinner color={foregroundColor} size="lg" />
          <AppText className={appTypography.bodyMuted}>Loading files…</AppText>
        </View>
      );
    }

    if (directoryError) {
      return (
        <View className="flex-1 items-center justify-center gap-4 px-6 py-16">
          <View className="size-14 items-center justify-center rounded-full bg-red-500/10">
            <StyledFeather className="text-red-500" name="alert-circle" size={appSizes.iconXl} />
          </View>
          <View className="items-center gap-2">
            <AppText className="text-base font-semibold text-foreground">
              Couldn&apos;t load this folder
            </AppText>
            <AppText className={cn(appTypography.bodyCentered, 'max-w-[280px]')}>
              {directoryError}
            </AppText>
          </View>
          <Button variant="secondary" onPress={() => void handleRefresh()}>
            <Button.Label>Retry</Button.Label>
          </Button>
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center gap-4 px-6 py-16">
        <View className="size-14 items-center justify-center rounded-full bg-foreground/5">
          <StyledFeather
            className={appColors.foregroundMuted}
            name="folder"
            size={appSizes.iconXl}
          />
        </View>
        <View className="items-center gap-2">
          <AppText className="text-base font-semibold text-foreground">
            This folder is empty
          </AppText>
          <AppText className={cn(appTypography.bodyCentered, 'max-w-[280px]')}>
            New files will appear here as the artifact grows.
          </AppText>
        </View>
      </View>
    );
  };

  const renderNavigationRow = () => (
    <View className="flex-row items-center gap-2 mt-[-10px] mx-[-8px]">
      <Button
        accessibilityLabel="Go back"
        className="size-8 rounded-full"
        isDisabled={!canGoBack}
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => handleHistoryNavigation('back')}
      >
        <StyledFeather className="text-foreground" name="chevron-left" size={appSizes.iconXs} />
      </Button>

      <View className="flex-1 flex-row items-center overflow-hidden">
        {visibleBreadcrumbItems.map((item, index) => {
          const isCurrent =
            item.kind === 'crumb' &&
            item.path === breadcrumbItems[breadcrumbItems.length - 1]?.path;

          return (
            <View
              key={item.kind === 'crumb' ? item.path || 'root' : item.key}
              className="flex-row items-center"
            >
              {index > 0 ? (
                <StyledFeather
                  className={appColors.foregroundSoft}
                  name="chevron-right"
                  size={appSizes.iconXs}
                />
              ) : null}

              {item.kind === 'ellipsis' ? (
                <AppText className="mx-1 text-[13px] text-muted">…</AppText>
              ) : (
                <Pressable
                  android_ripple={{ color: 'transparent' }}
                  disabled={isCurrent}
                  hitSlop={6}
                  style={{ borderCurve: 'continuous' }}
                  onPress={() => handleDirectoryPress(item.path)}
                >
                  <AppText
                    className={cn(
                      'mx-1 text-[13px]',
                      isCurrent ? 'font-medium text-foreground' : 'text-muted'
                    )}
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={{
                      flexShrink: 1,
                      maxWidth: isCurrent
                        ? breadcrumbAvailableWidth * 0.52
                        : breadcrumbAvailableWidth * 0.24,
                    }}
                  >
                    {item.label}
                  </AppText>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Button
        accessibilityLabel={selectedFilePath ? 'Refresh file' : 'Refresh folder'}
        className="size-8 rounded-full"
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => void handleRefresh()}
      >
        <StyledFeather className="text-foreground" name="refresh-cw" size={appSizes.iconXs} />
      </Button>

      <Button
        accessibilityLabel="Go forward"
        className="size-8 rounded-full"
        isDisabled={!canGoForward}
        isIconOnly
        size="sm"
        variant="ghost"
        onPress={() => handleHistoryNavigation('forward')}
      >
        <StyledFeather className="text-foreground" name="chevron-right" size={appSizes.iconXs} />
      </Button>
    </View>
  );

  const renderDirectoryView = () => (
    <View className="flex-1 gap-4">
      {renderNavigationRow()}

      <FlashList
        data={currentDirectory?.entries ?? []}
        keyExtractor={(entry) => `${entry.type}:${entry.path}`}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + appSpacing.xl,
        }}
        ListEmptyComponent={renderDirectoryEmptyState}
        ItemSeparatorComponent={() => <View style={{ height: appSpacing.sm }} />}
        onRefresh={() => void handleRefresh()}
        refreshing={isRefreshing}
        renderItem={({ item }) => (
          <Pressable
            android_ripple={{ color: 'transparent' }}
            style={{ borderCurve: 'continuous' }}
            onPress={() =>
              item.type === 'directory'
                ? handleDirectoryPress(item.path)
                : handleFilePress(item.path)
            }
          >
            <View className={appListStyles.filesystemRow}>
              <StyledFeather
                className={cn(
                  item.type === 'directory' ? 'text-foreground' : appColors.foregroundMuted
                )}
                name={getEntryIcon(item)}
                size={appSizes.iconMd}
              />
              <View className={appListStyles.rowContent}>
                <AppText className="text-[16px] font-medium text-foreground" numberOfLines={1}>
                  {item.name}
                </AppText>
              </View>
              {item.type === 'directory' ? (
                <StyledFeather
                  className={appColors.foregroundSoft}
                  name="chevron-right"
                  size={appSizes.iconSm}
                />
              ) : null}
            </View>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );

  const renderFilePreview = () => {
    if (selectedFilePath && isFileLoading && !selectedFile) {
      return (
        <View className="flex-1 items-center justify-center gap-3 px-6 py-16">
          <Spinner color={foregroundColor} size="lg" />
          <AppText className={appTypography.bodyMuted}>Loading file…</AppText>
        </View>
      );
    }

    if (selectedFilePath && fileError && !selectedFile) {
      return (
        <View className="flex-1 items-center justify-center gap-4 px-6 py-16">
          <View className="size-14 items-center justify-center rounded-full bg-red-500/10">
            <StyledFeather className="text-red-500" name="alert-circle" size={appSizes.iconXl} />
          </View>
          <View className="items-center gap-2">
            <AppText className="text-base font-semibold text-foreground">
              Couldn&apos;t open this file
            </AppText>
            <AppText className={cn(appTypography.bodyCentered, 'max-w-[280px]')}>
              {fileError}
            </AppText>
          </View>
          <Button variant="secondary" onPress={() => void handleRefresh()}>
            <Button.Label>Retry</Button.Label>
          </Button>
        </View>
      );
    }

    if (!selectedFilePath || !selectedFile) {
      return null;
    }

    return (
      <ArtifactFileViewer
        artifactCtx={artifactCtx}
        file={selectedFile}
        viewerKind={fileViewerKind ?? 'text'}
      />
    );
  };

  if (!artifactId) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <AppText className={appTypography.bodyMuted}>
          Choose an artifact to browse its files.
        </AppText>
      </View>
    );
  }

  return (
    <View className="flex-1 px-5 pt-4">
      {selectedFilePath ? (
        <View className="flex-1 gap-3">
          {renderNavigationRow()}
          <View
            className="min-h-0 flex-1 overflow-hidden"
            style={{ marginBottom: insets.bottom + appSpacing.sm }}
          >
            {renderFilePreview()}
          </View>
        </View>
      ) : (
        renderDirectoryView()
      )}
    </View>
  );
}
