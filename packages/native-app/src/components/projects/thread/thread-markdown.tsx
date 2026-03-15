import { useThemeColor } from 'heroui-native';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import ThreadMarkdownDom from '@/components/projects/thread/thread-markdown-dom';

type ThreadMarkdownProps = {
  children: string;
  compact?: boolean;
  resolveImageSource?: (source: string) => string | null;
  resolveLinkHref?: (href: string) => string | null;
};

export function ThreadMarkdown({
  children,
  compact = false,
  resolveImageSource,
  resolveLinkHref,
}: ThreadMarkdownProps) {
  const [foregroundColor, mutedColor, surfaceColor, backgroundColor, borderColor] = useThemeColor([
    'foreground',
    'muted',
    'default',
    'background',
    'border',
  ]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(compact ? 24 : 32);
  const linkColor = '#2563EB';
  const subtleSurface = compact ? 'rgba(15, 23, 42, 0.04)' : 'rgba(15, 23, 42, 0.05)';

  const handleHeightChange = useCallback(
    async (height: number) => {
      const nextHeight = Math.max(compact ? 24 : 32, Math.ceil(height));
      setMeasuredHeight((current) => (current === nextHeight ? current : nextHeight));
    },
    [compact]
  );

  const domStyle = useMemo(
    () => ({
      height: measuredHeight,
      width: containerWidth,
    }),
    [containerWidth, measuredHeight]
  );
  const theme = useMemo(
    () => ({
      background: backgroundColor,
      blockquoteBackground: subtleSurface,
      border: borderColor,
      codeBackground: surfaceColor,
      foreground: foregroundColor,
      link: linkColor,
      muted: mutedColor,
    }),
    [backgroundColor, borderColor, foregroundColor, mutedColor, subtleSurface, surfaceColor]
  );

  return (
    <View
      className="w-full"
      onLayout={(event) => {
        const nextWidth = Math.ceil(event.nativeEvent.layout.width);
        setContainerWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
      style={{ minHeight: measuredHeight }}
    >
      {containerWidth > 0 ? (
        <ThreadMarkdownDom
          compact={compact}
          dom={{
            contentInsetAdjustmentBehavior: 'never',
            scrollEnabled: false,
            style: domStyle,
          }}
          markdown={children}
          onHeightChange={handleHeightChange}
          resolveImageSource={resolveImageSource}
          resolveLinkHref={resolveLinkHref}
          theme={theme}
        />
      ) : null}
    </View>
  );
}
