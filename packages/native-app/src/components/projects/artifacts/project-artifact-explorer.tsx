import Feather from '@expo/vector-icons/Feather';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Button, Spinner, useThemeColor } from 'heroui-native';
import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ArtifactExplorerEntry, ArtifactFileResult } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { ArtifactMarkdownPreview } from '@/components/projects/artifacts/artifact-markdown-preview';
import { ThreadCodeBlock } from '@/components/projects/thread/thread-code-block';
import { getArtifactRawFileUrl } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { useArtifactFilesStore, useSidebarStore } from '@/stores';
import { appColors, appListStyles, appSizes, appSpacing, appTypography } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

const MARKDOWN_EXTENSIONS = new Set(['markdown', 'md', 'mdown', 'mdx']);
const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);
const UNSUPPORTED_EXTENSIONS = new Set([
  '3gp',
  'aac',
  'avi',
  'flac',
  'm4a',
  'mkv',
  'mov',
  'mp3',
  'mp4',
  'mpeg',
  'mpg',
  'ogg',
  'ogv',
  'pdf',
  'wav',
  'webm',
]);

type ProjectArtifactExplorerProps = {
  artifactId: string;
  projectId: string;
};

type ViewerKind = 'image' | 'markdown' | 'text' | 'unsupported';

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

function normalizeRelativePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function getDirectoryRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::dir::${path}`;
}

function getFileRequestKey(artifactKey: string, path: string): string {
  return `${artifactKey}::file::${path}`;
}

function getPathBasename(path: string): string {
  const safePath = normalizeRelativePath(path);
  const lastSlashIndex = safePath.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return safePath;
  }

  return safePath.slice(lastSlashIndex + 1);
}

function getPathExtension(path: string): string {
  const basename = getPathBasename(path);
  const lastDotIndex = basename.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return '';
  }

  return basename.slice(lastDotIndex + 1).toLowerCase();
}

function getViewerKind(path: string, isBinary: boolean): ViewerKind {
  const extension = getPathExtension(path);

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return 'markdown';
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (UNSUPPORTED_EXTENSIONS.has(extension)) {
    return 'unsupported';
  }

  return isBinary ? 'unsupported' : 'text';
}

function getFileLanguage(path: string): string {
  const extension = getPathExtension(path);

  if (!extension) {
    return 'plaintext';
  }

  switch (extension) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'md':
    case 'markdown':
    case 'mdx':
      return 'markdown';
    case 'json':
      return 'json';
    case 'yml':
      return 'yaml';
    case 'sh':
      return 'bash';
    default:
      return extension;
  }
}

function formatFileSize(size: number | null | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return 'Unknown size';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return 'file-text';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  return 'file';
}

function getFileModeTitle(rootLabel: string, filePath: string): string {
  return getPathBasename(filePath) || rootLabel;
}

function FileMetadataChip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-foreground/5 px-3 py-1.5">
      <AppText className="text-[12px] font-medium text-foreground">{label}</AppText>
    </View>
  );
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
  const breadcrumbItems = buildBreadcrumbs(rootLabel, currentDirectoryPath);
  const navigationHistory = navigationHistoryByArtifact[artifactKey] ?? null;
  const fileViewerKind = selectedFilePath
    ? getViewerKind(selectedFilePath, selectedFile?.isBinary ?? false)
    : null;
  const imagePreviewHeight = Math.min(Math.max(width - appSpacing.xl * 2, 220), 360);
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

  const handleOpenExternal = (filePath: string) => {
    if (!artifactId) {
      return;
    }

    void Linking.openURL(getArtifactRawFileUrl(artifactCtx, { path: filePath }));
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

  const renderDirectoryView = () => (
    <View className="flex-1 gap-4">
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
          accessibilityLabel="Refresh folder"
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

  const renderTextPreview = (file: ArtifactFileResult) => (
    <ThreadCodeBlock code={file.content} compact={false} language={getFileLanguage(file.path)} />
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

    switch (fileViewerKind) {
      case 'markdown':
        return (
          <View
            className="rounded-[26px] border border-foreground/10 bg-default px-4 py-4"
            style={{ borderCurve: 'continuous' }}
          >
            <ArtifactMarkdownPreview artifactCtx={artifactCtx} filePath={selectedFile.path}>
              {selectedFile.content}
            </ArtifactMarkdownPreview>
          </View>
        );
      case 'image':
        return (
          <View
            className="overflow-hidden rounded-[26px] border border-foreground/10 bg-default"
            style={{ borderCurve: 'continuous' }}
          >
            <Image
              accessibilityLabel={getPathBasename(selectedFile.path)}
              contentFit="contain"
              source={{ uri: getArtifactRawFileUrl(artifactCtx, { path: selectedFile.path }) }}
              style={{ height: imagePreviewHeight, width: '100%' }}
            />
          </View>
        );
      case 'unsupported':
        return (
          <View
            className="gap-4 rounded-[26px] border border-foreground/10 bg-default px-4 py-4"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-start gap-3">
              <View className="size-10 items-center justify-center rounded-full bg-foreground/5">
                <StyledFeather
                  className={appColors.foregroundMuted}
                  name="file"
                  size={appSizes.iconMd}
                />
              </View>
              <View className="flex-1 gap-1">
                <AppText className="text-[16px] font-semibold text-foreground">
                  Preview not available on mobile
                </AppText>
                <AppText className={appTypography.body}>
                  This file type isn&apos;t rendered inline yet. You can still open the raw file
                  externally.
                </AppText>
              </View>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <FileMetadataChip label={formatFileSize(selectedFile.size)} />
              <FileMetadataChip label={formatUpdatedAt(selectedFile.updatedAt)} />
              <FileMetadataChip label={getPathExtension(selectedFile.path) || 'binary'} />
            </View>
            <Button
              className="self-start"
              variant="secondary"
              onPress={() => handleOpenExternal(selectedFile.path)}
            >
              <Button.Label>Open externally</Button.Label>
            </Button>
          </View>
        );
      case 'text':
      default:
        return renderTextPreview(selectedFile);
    }
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
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            gap: appSpacing.md,
            paddingBottom: insets.bottom + appSpacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              colors={[foregroundColor]}
              onRefresh={() => void handleRefresh()}
              refreshing={isRefreshing}
              tintColor={foregroundColor}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View
            className="gap-4 rounded-[30px] border border-foreground/10 bg-default px-4 py-4"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-3">
              <Button
                accessibilityLabel="Back to files"
                className="rounded-full"
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() =>
                  pushNavigationState(artifactCtx, {
                    directoryPath: currentDirectoryPath,
                    filePath: null,
                  })
                }
              >
                <StyledFeather
                  className="text-foreground"
                  name="arrow-left"
                  size={appSizes.iconSm}
                />
              </Button>
              <View className="flex-1 gap-1">
                <AppText className="text-[12px] font-medium uppercase tracking-[0.18em] text-muted">
                  File
                </AppText>
                <AppText
                  className="text-[20px] font-semibold tracking-tight text-foreground"
                  numberOfLines={1}
                >
                  {getFileModeTitle(rootLabel, selectedFilePath)}
                </AppText>
                <AppText className="text-[13px] text-muted" numberOfLines={1}>
                  {selectedFilePath}
                </AppText>
              </View>
              <Button
                accessibilityLabel="Refresh file"
                className="size-8 rounded-full"
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => void handleRefresh()}
              >
                <StyledFeather
                  className="text-foreground"
                  name="refresh-cw"
                  size={appSizes.iconXs}
                />
              </Button>
            </View>

            {selectedFile ? (
              <View className="flex-row flex-wrap gap-2">
                <FileMetadataChip label={formatFileSize(selectedFile.size)} />
                <FileMetadataChip label={formatUpdatedAt(selectedFile.updatedAt)} />
                <FileMetadataChip
                  label={fileViewerKind === 'text' ? 'Text preview' : `${fileViewerKind} preview`}
                />
              </View>
            ) : null}
          </View>

          {selectedFile?.truncated ? (
            <View
              className="flex-row items-start gap-3 rounded-[22px] border border-amber-500/20 bg-amber-500/10 px-4 py-3"
              style={{ borderCurve: 'continuous' }}
            >
              <StyledFeather
                className="mt-0.5 text-amber-600"
                name="alert-triangle"
                size={appSizes.iconSm}
              />
              <View className="flex-1 gap-1">
                <AppText className="text-[14px] font-semibold text-foreground">
                  Preview truncated
                </AppText>
                <AppText className="text-[13px] leading-5 text-muted">
                  Only part of this file is loaded on mobile. Open the raw file externally if you
                  need the full contents.
                </AppText>
              </View>
            </View>
          ) : null}

          {renderFilePreview()}
        </ScrollView>
      ) : (
        renderDirectoryView()
      )}
    </View>
  );
}
