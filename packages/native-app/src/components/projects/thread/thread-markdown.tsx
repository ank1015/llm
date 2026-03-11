import Markdown, {
  MarkdownIt,
  type ASTNode,
  type RenderRules,
} from '@ronradtke/react-native-markdown-display';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useThemeColor } from 'heroui-native';
import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ThreadCodeBlock } from '@/components/projects/thread/thread-code-block';
import ThreadMarkdownDom from '@/components/projects/thread/thread-markdown-dom';
import { shouldUseDomFallback } from '@/lib/messages/markdown';

type ThreadMarkdownProps = {
  children: string;
  compact?: boolean;
};

function getCodeLanguage(node: ASTNode): string {
  const language = node.sourceInfo.trim().split(/\s+/)[0];
  return language && language.length > 0 ? language : 'plaintext';
}

export function ThreadMarkdown({ children, compact = false }: ThreadMarkdownProps) {
  const [foregroundColor, mutedColor, surfaceColor, backgroundColor, borderColor] = useThemeColor([
    'foreground',
    'muted',
    'default',
    'background',
    'border',
  ]);
  const linkColor = '#2563EB';
  const subtleSurface = compact ? 'rgba(15, 23, 42, 0.04)' : 'rgba(15, 23, 42, 0.05)';

  const markdownIt = useMemo(
    () =>
      MarkdownIt({
        breaks: true,
        linkify: true,
        typographer: true,
      }),
    []
  );

  const rules = useMemo<RenderRules>(
    () => ({
      fence: (node) => (
        <View key={node.key} className="my-3">
          <ThreadCodeBlock code={node.content} compact={compact} language={getCodeLanguage(node)} />
        </View>
      ),
      code_block: (node) => (
        <View key={node.key} className="my-3">
          <ThreadCodeBlock code={node.content} compact={compact} />
        </View>
      ),
      image: (node) => {
        const source = node.attributes.src;

        if (typeof source !== 'string' || source.length === 0) {
          return null;
        }

        return (
          <View key={node.key} className="my-3 overflow-hidden rounded-[18px] bg-default">
            <Image
              accessible={Boolean(node.attributes.alt)}
              accessibilityLabel={node.attributes.alt}
              contentFit="contain"
              source={{ uri: source }}
              style={{ height: compact ? 180 : 220, width: '100%' }}
            />
          </View>
        );
      },
      link: (node, childrenNodes, _parent, _styles, onLinkPress) => (
        <Pressable
          accessibilityRole="link"
          key={node.key}
          onPress={() => {
            const result = onLinkPress?.(node.attributes.href);
            if (result === true && typeof node.attributes.href === 'string') {
              void Linking.openURL(node.attributes.href);
            }
          }}
        >
          <AppText className={compact ? 'text-[13px]' : 'text-[15px]'} style={{ color: linkColor }}>
            {childrenNodes}
          </AppText>
        </Pressable>
      ),
      blocklink: (node, childrenNodes, _parent, _styles, onLinkPress) => (
        <Pressable
          accessibilityRole="link"
          key={node.key}
          onPress={() => {
            const result = onLinkPress?.(node.attributes.href);
            if (result === true && typeof node.attributes.href === 'string') {
              void Linking.openURL(node.attributes.href);
            }
          }}
        >
          <View>{childrenNodes}</View>
        </Pressable>
      ),
      table: (node, childrenNodes) => (
        <ScrollView
          key={node.key}
          horizontal
          className="my-4 rounded-[18px] border border-foreground/10 bg-default"
          showsHorizontalScrollIndicator={false}
        >
          <View className="min-w-full">{childrenNodes}</View>
        </ScrollView>
      ),
    }),
    [compact, linkColor]
  );

  const markdownStyle = useMemo(
    // eslint-disable-next-line sonarjs/cognitive-complexity
    () => ({
      body: {
        color: foregroundColor,
        fontSize: compact ? 13 : 15,
        lineHeight: compact ? 20 : 27,
      },
      blockquote: {
        backgroundColor: subtleSurface,
        borderLeftColor: borderColor,
        borderLeftWidth: 3,
        borderRadius: 14,
        marginBottom: compact ? 12 : 16,
        marginTop: compact ? 8 : 12,
        paddingBottom: 10,
        paddingHorizontal: 14,
        paddingTop: 10,
      },
      bullet_list: {
        marginBottom: compact ? 10 : 14,
        marginTop: compact ? 8 : 10,
      },
      bullet_list_content: {
        flex: 1,
      },
      bullet_list_icon: {
        color: mutedColor,
        marginRight: 8,
      },
      code_inline: {
        backgroundColor: surfaceColor,
        borderColor,
        borderRadius: 8,
        borderWidth: 1,
        color: foregroundColor,
        fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: compact ? 12 : 13,
        overflow: 'hidden' as const,
        paddingHorizontal: 6,
        paddingVertical: 2,
      },
      em: {
        fontStyle: 'italic' as const,
      },
      heading1: {
        fontSize: compact ? 20 : 24,
        fontWeight: '700' as const,
        marginBottom: 10,
        marginTop: 18,
      },
      heading2: {
        fontSize: compact ? 18 : 20,
        fontWeight: '700' as const,
        marginBottom: 8,
        marginTop: 16,
      },
      heading3: {
        fontSize: compact ? 16 : 18,
        fontWeight: '600' as const,
        marginBottom: 8,
        marginTop: 14,
      },
      heading4: {
        fontSize: compact ? 15 : 16,
        fontWeight: '600' as const,
        marginBottom: 8,
        marginTop: 14,
      },
      heading5: {
        fontSize: compact ? 14 : 15,
        fontWeight: '600' as const,
        marginBottom: 6,
        marginTop: 12,
      },
      heading6: {
        fontSize: compact ? 13 : 14,
        fontWeight: '600' as const,
        marginBottom: 6,
        marginTop: 12,
      },
      hr: {
        backgroundColor: borderColor,
        height: 1,
        marginVertical: compact ? 14 : 20,
      },
      image: {
        borderRadius: 18,
      },
      link: {
        color: linkColor,
      },
      list_item: {
        color: foregroundColor,
        marginBottom: 4,
      },
      ordered_list: {
        marginBottom: compact ? 10 : 14,
        marginTop: compact ? 8 : 10,
      },
      ordered_list_content: {
        flex: 1,
      },
      ordered_list_icon: {
        color: mutedColor,
        fontVariant: ['tabular-nums'] as const,
        marginRight: 8,
      },
      paragraph: {
        marginBottom: compact ? 10 : 14,
      },
      s: {
        textDecorationLine: 'line-through' as const,
      },
      strong: {
        fontWeight: '700' as const,
      },
      table: {
        minWidth: 320,
      },
      tbody: {},
      td: {
        borderColor,
        borderTopWidth: 1,
        minWidth: 140,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      text: {
        color: foregroundColor,
      },
      th: {
        backgroundColor: subtleSurface,
        minWidth: 140,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      tr: {
        borderColor,
        flexDirection: 'row' as const,
      },
    }),
    [borderColor, compact, foregroundColor, linkColor, mutedColor, subtleSurface, surfaceColor]
  );

  if (shouldUseDomFallback(children)) {
    return (
      <ThreadMarkdownDom
        compact={compact}
        dom={{
          contentInsetAdjustmentBehavior: 'never',
          scrollEnabled: false,
          style: {
            minHeight: compact ? 24 : 32,
            width: '100%',
          },
        }}
        markdown={children}
        theme={{
          background: backgroundColor,
          blockquoteBackground: subtleSurface,
          border: borderColor,
          codeBackground: surfaceColor,
          foreground: foregroundColor,
          link: linkColor,
          muted: mutedColor,
        }}
      />
    );
  }

  return (
    <Markdown
      markdownit={markdownIt}
      mergeStyle
      onLinkPress={(url) => {
        void WebBrowser.openBrowserAsync(url);
        return false;
      }}
      rules={rules}
      style={markdownStyle}
    >
      {children}
    </Markdown>
  );
}
