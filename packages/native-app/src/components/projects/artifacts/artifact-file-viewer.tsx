import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Spinner, useThemeColor } from 'heroui-native';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

import type { ArtifactViewerKind } from '@/components/projects/artifacts/artifact-file-viewer-shared';
import type { ArtifactContext, ArtifactFileResult } from '@/lib/client-api';
import type { LayoutChangeEvent } from 'react-native';

import ArtifactFileViewerDom from '@/components/projects/artifacts/artifact-file-viewer-dom';
import { useAppTheme } from '@/contexts/app-theme-context';
import { getArtifactFileBaseUrl, getArtifactRawFileUrl } from '@/lib/client-api';

type ArtifactFileViewerProps = {
  artifactCtx: ArtifactContext;
  file: ArtifactFileResult;
  viewerKind: ArtifactViewerKind;
};

export function ArtifactFileViewer({ artifactCtx, file, viewerKind }: ArtifactFileViewerProps) {
  const { isDark } = useAppTheme();
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const [backgroundColor, foregroundColor, mutedColor, panelColor, borderColor, hoverColor] =
    useThemeColor(['background', 'foreground', 'muted', 'default', 'border', 'surface-hover']);
  const rawFileUrl = useMemo(
    () => getArtifactRawFileUrl(artifactCtx, { path: file.path }),
    [artifactCtx, file.path]
  );

  const theme = useMemo(
    () => ({
      background: backgroundColor,
      border: borderColor,
      foreground: foregroundColor,
      hover: hoverColor,
      isDark,
      link: isDark ? '#7DD3FC' : '#0369A1',
      muted: mutedColor,
      panel: panelColor,
    }),
    [backgroundColor, borderColor, foregroundColor, hoverColor, isDark, mutedColor, panelColor]
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;

    setViewport((current) => {
      if (current.width === width && current.height === height) {
        return current;
      }

      return { height, width };
    });
  }, []);

  if (viewerKind === 'pdf') {
    return (
      <View className="min-h-0 flex-1 overflow-hidden">
        <WebView
          originWhitelist={['*']}
          source={{ uri: rawFileUrl }}
          startInLoadingState
          renderLoading={() => (
            <View className="flex-1 items-center justify-center">
              <Spinner color={foregroundColor} size="lg" />
            </View>
          )}
          style={{
            backgroundColor,
            flex: 1,
          }}
        />
      </View>
    );
  }

  return (
    <View className="min-h-0 flex-1 overflow-hidden" onLayout={handleLayout}>
      {viewport.width > 0 && viewport.height > 0 ? (
        <ArtifactFileViewerDom
          artifactFileBaseUrl={getArtifactFileBaseUrl(artifactCtx)}
          content={file.content}
          copyText={async (text: string) => {
            await Clipboard.setStringAsync(text);
          }}
          currentFileRawUrl={rawFileUrl}
          filePath={file.path}
          isBinary={file.isBinary}
          openExternal={async (url: string) => {
            await WebBrowser.openBrowserAsync(url);
          }}
          size={file.size}
          theme={theme}
          truncated={file.truncated}
          viewerKind={viewerKind}
          dom={{
            contentInsetAdjustmentBehavior: 'never',
            scrollEnabled: true,
            style: {
              height: viewport.height,
              width: viewport.width,
            },
          }}
        />
      ) : null}
    </View>
  );
}
