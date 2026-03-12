import { useThemeColor } from 'heroui-native';
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';
import {
  MarkedLexer,
  Renderer,
  useMarkdown,
  type MarkedStyles,
  type RendererInterface,
} from 'react-native-marked';

import { AppText } from '@/components/app-text';
import { ThreadCodeBlock } from '@/components/projects/thread/thread-code-block';
import { isInlineFilePath } from '@/lib/messages/markdown';

type ThreadTranscriptMarkdownProps = {
  children: string;
  compact?: boolean;
};

type ThreadMarkdownPalette = {
  blockquoteBackground: string;
  border: string;
  codeBackground: string;
  foreground: string;
  link: string;
  muted: string;
};

const MONOSPACE_FONT = process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace';

function isInlinePathLike(value: string): boolean {
  if (isInlineFilePath(value)) {
    return true;
  }

  const trimmed = value.trim();
  if (trimmed.length < 3 || /\s/.test(trimmed)) {
    return false;
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return true;
  }

  return /^[A-Za-z0-9._-]+$/.test(trimmed) && (trimmed.includes('_') || trimmed.includes('-'));
}

function normalizeThreadMarkdown(markdown: string): string {
  return markdown.replace(/\*\*`([^`\n]+)`\*\*/g, (match, candidate) => {
    return isInlinePathLike(candidate) ? `\`${candidate}\`` : match;
  });
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const blocks = MarkedLexer(markdown, {
    breaks: true,
    gfm: true,
  })
    .map((token) => token.raw)
    .filter((block) => block.trim().length > 0);

  return blocks.length > 0 ? blocks : [markdown];
}

function createMarkedStyles({
  compact,
  palette,
}: {
  compact: boolean;
  palette: ThreadMarkdownPalette;
}): MarkedStyles {
  const baseFontSize = compact ? 13 : 15;
  const baseLineHeight = compact ? 20 : 27;

  return StyleSheet.create<MarkedStyles>({
    blockquote: {
      marginVertical: compact ? 12 : 16,
    },
    code: {
      marginVertical: compact ? 12 : 16,
    },
    codespan: {
      color: palette.foreground,
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 18 : 20,
    },
    em: {
      color: palette.foreground,
      fontSize: baseFontSize,
      fontStyle: 'italic',
      lineHeight: baseLineHeight,
    },
    h1: {
      color: palette.foreground,
      fontSize: compact ? 20 : 24,
      fontWeight: '600',
      lineHeight: compact ? 28 : 32,
      marginTop: compact ? 18 : 22,
      marginBottom: compact ? 8 : 10,
    },
    h2: {
      color: palette.foreground,
      fontSize: compact ? 18 : 20,
      fontWeight: '600',
      lineHeight: compact ? 26 : 30,
      marginTop: compact ? 16 : 20,
      marginBottom: compact ? 8 : 10,
    },
    h3: {
      color: palette.foreground,
      fontSize: compact ? 16 : 18,
      fontWeight: '600',
      lineHeight: compact ? 24 : 28,
      marginTop: compact ? 14 : 18,
      marginBottom: compact ? 8 : 10,
    },
    h4: {
      color: palette.foreground,
      fontSize: compact ? 15 : 16,
      fontWeight: '600',
      lineHeight: compact ? 22 : 24,
      marginTop: compact ? 14 : 18,
      marginBottom: compact ? 6 : 8,
    },
    h5: {
      color: palette.foreground,
      fontSize: compact ? 14 : 15,
      fontWeight: '600',
      lineHeight: compact ? 20 : 22,
      marginTop: compact ? 12 : 14,
      marginBottom: compact ? 6 : 8,
    },
    h6: {
      color: palette.foreground,
      fontSize: compact ? 13 : 14,
      fontWeight: '600',
      lineHeight: compact ? 18 : 20,
      marginTop: compact ? 12 : 14,
      marginBottom: compact ? 6 : 8,
    },
    hr: {
      marginVertical: compact ? 16 : 20,
    },
    image: {
      borderRadius: 16,
      marginVertical: compact ? 12 : 16,
    },
    li: {
      color: palette.foreground,
      flexShrink: 1,
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
    },
    link: {
      color: palette.link,
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
      textDecorationLine: 'none',
    },
    list: {
      marginVertical: compact ? 8 : 10,
    },
    paragraph: {
      marginBottom: compact ? 10 : 14,
    },
    strong: {
      color: palette.foreground,
      fontSize: baseFontSize,
      fontWeight: '600',
      lineHeight: baseLineHeight,
    },
    strikethrough: {
      color: palette.foreground,
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
      textDecorationLine: 'line-through',
    },
    table: {
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      marginVertical: compact ? 12 : 16,
      overflow: 'hidden',
    },
    tableCell: {
      borderColor: palette.border,
      paddingHorizontal: compact ? 10 : 12,
      paddingVertical: compact ? 8 : 10,
    },
    tableRow: {
      borderColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
    },
    text: {
      color: palette.foreground,
      flexShrink: 1,
      fontSize: baseFontSize,
      lineHeight: baseLineHeight,
    },
  });
}

class ThreadTranscriptRenderer extends Renderer implements RendererInterface {
  constructor(
    private readonly compact: boolean,
    private readonly palette: ThreadMarkdownPalette
  ) {
    super();
  }

  override paragraph(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <View key={this.getKey()} style={styles}>
        {children}
      </View>
    );
  }

  override blockquote(children: ReactNode[], styles?: ViewStyle): ReactNode {
    return (
      <View
        key={this.getKey()}
        style={[
          {
            backgroundColor: this.palette.blockquoteBackground,
            borderLeftColor: this.palette.border,
            borderLeftWidth: 3,
            borderRadius: 16,
            paddingHorizontal: this.compact ? 12 : 14,
            paddingVertical: this.compact ? 10 : 12,
          },
          styles,
        ]}
      >
        {children}
      </View>
    );
  }

  override heading(text: string | ReactNode[], styles?: TextStyle, _depth?: number): ReactNode {
    return (
      <AppText key={this.getKey()} selectable style={styles}>
        {text}
      </AppText>
    );
  }

  override code(
    text: string,
    language?: string,
    _containerStyle?: ViewStyle,
    _textStyle?: TextStyle
  ): ReactNode {
    return (
      <View key={this.getKey()}>
        <ThreadCodeBlock code={text} compact={this.compact} language={language} />
      </View>
    );
  }

  override hr(styles?: ViewStyle): ReactNode {
    return (
      <View
        key={this.getKey()}
        style={[
          {
            backgroundColor: this.palette.border,
            height: 1,
            width: '100%',
          },
          styles,
        ]}
      />
    );
  }

  override text(text: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <AppText key={this.getKey()} selectable style={styles}>
        {text}
      </AppText>
    );
  }

  override strong(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <AppText key={this.getKey()} selectable style={styles}>
        {children}
      </AppText>
    );
  }

  override em(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <AppText key={this.getKey()} selectable style={styles}>
        {children}
      </AppText>
    );
  }

  override del(children: string | ReactNode[], styles?: TextStyle): ReactNode {
    return (
      <AppText key={this.getKey()} selectable style={styles}>
        {children}
      </AppText>
    );
  }

  override codespan(text: string, styles?: TextStyle): ReactNode {
    const isPathLike = isInlinePathLike(text);

    return (
      <AppText
        key={this.getKey()}
        selectable={!isPathLike}
        style={[
          styles,
          isPathLike
            ? {
                backgroundColor: 'transparent',
                color: this.palette.foreground,
                fontSize: this.compact ? 13 : 15,
                fontStyle: 'normal',
                fontWeight: '600',
                lineHeight: this.compact ? 20 : 27,
                paddingHorizontal: 0,
                paddingVertical: 0,
              }
            : {
                backgroundColor: this.palette.codeBackground,
                borderColor: this.palette.border,
                borderRadius: 10,
                borderWidth: 1,
                color: this.palette.foreground,
                fontFamily: MONOSPACE_FONT,
                paddingHorizontal: 6,
                paddingVertical: 2,
              },
        ]}
      >
        {text}
      </AppText>
    );
  }
}

const MemoizedThreadTranscriptMarkdownBlock = memo(
  function ThreadTranscriptMarkdownBlock({
    compact,
    content,
    palette,
  }: {
    compact: boolean;
    content: string;
    palette: ThreadMarkdownPalette;
  }) {
    const renderer = useMemo(
      () => new ThreadTranscriptRenderer(compact, palette),
      [compact, palette]
    );
    const styles = useMemo(
      () =>
        createMarkedStyles({
          compact,
          palette,
        }),
      [compact, palette]
    );
    const elements = useMarkdown(content, {
      renderer,
      styles,
    });

    return (
      <View className="w-full">
        {elements.map((element, index) => (
          <Fragment key={`thread-transcript-block-node-${index}`}>{element}</Fragment>
        ))}
      </View>
    );
  },
  (previousProps, nextProps) =>
    previousProps.compact === nextProps.compact &&
    previousProps.content === nextProps.content &&
    previousProps.palette.blockquoteBackground === nextProps.palette.blockquoteBackground &&
    previousProps.palette.border === nextProps.palette.border &&
    previousProps.palette.codeBackground === nextProps.palette.codeBackground &&
    previousProps.palette.foreground === nextProps.palette.foreground &&
    previousProps.palette.link === nextProps.palette.link &&
    previousProps.palette.muted === nextProps.palette.muted
);

export function ThreadTranscriptMarkdown({
  children,
  compact = false,
}: ThreadTranscriptMarkdownProps) {
  const [foregroundColor, mutedColor, surfaceColor, borderColor] = useThemeColor([
    'foreground',
    'muted',
    'default',
    'border',
  ]);
  const normalizedMarkdown = useMemo(() => normalizeThreadMarkdown(children), [children]);
  const blocks = useMemo(() => parseMarkdownIntoBlocks(normalizedMarkdown), [normalizedMarkdown]);
  const palette = useMemo<ThreadMarkdownPalette>(
    () => ({
      blockquoteBackground: compact ? 'rgba(15, 23, 42, 0.04)' : 'rgba(15, 23, 42, 0.05)',
      border: borderColor,
      codeBackground: surfaceColor,
      foreground: foregroundColor,
      link: '#2563EB',
      muted: mutedColor,
    }),
    [borderColor, compact, foregroundColor, mutedColor, surfaceColor]
  );

  return (
    <View className="w-full">
      {blocks.map((block, index) => (
        <MemoizedThreadTranscriptMarkdownBlock
          key={`thread-transcript-markdown-block-${index}`}
          compact={compact}
          content={block}
          palette={palette}
        />
      ))}
    </View>
  );
}
