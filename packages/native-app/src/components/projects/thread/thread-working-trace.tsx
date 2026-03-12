import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useToast } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { withUniwind } from 'uniwind';

import type {
  WorkingToolEntry,
  WorkingTraceItem,
  WorkingTraceModel,
} from '@/lib/messages/working-trace';

import { AppText } from '@/components/app-text';
import { ThreadTranscriptMarkdown } from '@/components/projects/thread/thread-transcript-markdown';
import {
  getWorkingTraceFiles,
  getWorkingTraceImages,
  getWorkingTraceTextContent,
} from '@/lib/messages/working-trace';

const StyledFeather = withUniwind(Feather);

type ThreadWorkingTraceProps = {
  label: string;
  live: boolean;
  model: WorkingTraceModel;
};

function renderUnknownArgs(args: unknown): string | null {
  if (args === undefined) {
    return null;
  }

  if (typeof args === 'string') {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return null;
  }
}

function getStringArg(args: unknown, key: string): string | null {
  if (typeof args !== 'object' || args === null || !(key in args)) {
    return null;
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getToolPanelLabel(toolName: string): string {
  switch (toolName) {
    case 'bash':
      return 'Shell';
    case 'ls':
      return 'List';
    case 'find':
      return 'Find';
    case 'grep':
      return 'Grep';
    case 'read':
      return 'Read';
    case 'write':
      return 'Write';
    case 'edit':
      return 'Edit';
    default:
      return 'Tool';
  }
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function getToolCopyText(entry: WorkingToolEntry): string | null {
  const textContent = getWorkingTraceTextContent(entry.content);

  if (entry.toolName === 'bash') {
    const command = getStringArg(entry.args, 'command');
    const output = textContent || entry.errorText;
    const value = [command ? `$ ${command}` : null, output].filter(Boolean).join('\n\n').trim();
    return value.length > 0 ? value : null;
  }

  if (entry.toolName === 'edit') {
    const diff =
      typeof entry.details === 'object' && entry.details !== null && 'diff' in entry.details
        ? (entry.details as { diff?: unknown }).diff
        : undefined;

    if (typeof diff === 'string' && diff.trim().length > 0) {
      return diff;
    }

    const oldText = getStringArg(entry.args, 'oldText');
    const newText = getStringArg(entry.args, 'newText');
    const value = [
      oldText ? `Before\n${oldText}` : null,
      newText ? `After\n${newText}` : null,
      textContent || entry.errorText || null,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    return value.length > 0 ? value : null;
  }

  if (entry.toolName === 'write') {
    const content = getStringArg(entry.args, 'content');
    const value = [content, textContent || entry.errorText || null]
      .filter(Boolean)
      .join('\n\n')
      .trim();
    return value.length > 0 ? value : null;
  }

  const value = (textContent || renderUnknownArgs(entry.args) || entry.errorText || '').trim();
  return value.length > 0 ? value : null;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function ToolContentPreview({ entry }: { entry: WorkingToolEntry }) {
  const textContent = useMemo(() => getWorkingTraceTextContent(entry.content), [entry.content]);
  const images = useMemo(() => getWorkingTraceImages(entry.content), [entry.content]);
  const files = useMemo(() => getWorkingTraceFiles(entry.content), [entry.content]);

  const bodyText = textContent || renderUnknownArgs(entry.args) || entry.errorText || '(no output)';

  if (entry.toolName === 'bash') {
    const command = getStringArg(entry.args, 'command');
    const bashText = [command ? `$ ${command}` : null, textContent || entry.errorText || null]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    return (
      <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
        <AppText
          selectable
          className="text-[12px] leading-5 text-foreground"
          style={{ fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' }}
        >
          {bashText || '(no output)'}
        </AppText>
      </ScrollView>
    );
  }

  if (entry.toolName === 'edit') {
    const diff =
      typeof entry.details === 'object' && entry.details !== null && 'diff' in entry.details
        ? (entry.details as { diff?: unknown }).diff
        : undefined;

    if (typeof diff === 'string' && diff.trim().length > 0) {
      return (
        <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
          <AppText
            selectable
            className="text-[12px] leading-5 text-foreground"
            style={{ fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' }}
          >
            {diff}
          </AppText>
        </ScrollView>
      );
    }
  }

  if (images.length > 0 || files.length > 0) {
    return (
      <View className="gap-3">
        {textContent ? (
          <ScrollView nestedScrollEnabled style={{ maxHeight: 160 }}>
            <AppText
              selectable
              className="text-[12px] leading-5 text-foreground"
              style={{ fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' }}
            >
              {textContent}
            </AppText>
          </ScrollView>
        ) : null}
        {images.length > 0 ? (
          <View className="gap-3">
            {images.map((image, index) => (
              <View
                key={`${entry.toolCallId}-image-${index}`}
                className="overflow-hidden rounded-[16px] bg-default"
              >
                <Image
                  contentFit="contain"
                  source={{ uri: `data:${image.mimeType};base64,${image.data}` }}
                  style={{ height: 180, width: '100%' }}
                />
              </View>
            ))}
          </View>
        ) : null}
        {files.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {files.map((file, index) => (
              <View
                key={`${entry.toolCallId}-file-${index}`}
                className="rounded-full border border-foreground/10 px-3 py-1.5"
              >
                <AppText className="text-[11px] font-medium text-foreground">
                  {file.filename}
                </AppText>
                <AppText className="text-[11px] text-muted">{file.mimeType}</AppText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
      <AppText
        selectable
        className="text-[12px] leading-5 text-foreground"
        style={{ fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' }}
      >
        {bodyText}
      </AppText>
    </ScrollView>
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function ToolTraceItem({ entry }: { entry: WorkingToolEntry }) {
  const { toast } = useToast();
  const copyText = useMemo(() => getToolCopyText(entry), [entry]);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setCopied(false);
    }, 1800);

    return () => {
      clearTimeout(timeout);
    };
  }, [copied]);

  const handleCopy = () => {
    if (!copyText) {
      return;
    }

    void Clipboard.setStringAsync(copyText).then(() => {
      setCopied(true);
      toast.show({
        label: 'Copied',
        description: 'Tool output copied to clipboard.',
      });
    });
  };

  return (
    <View className="w-full gap-2 pb-3">
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: 'transparent' }}
        className="flex-row items-center gap-2"
        style={{ borderCurve: 'continuous' }}
        onPress={() => {
          setIsOpen((current) => !current);
        }}
      >
        <AppText className="flex-1 text-[13px] font-medium text-foreground">{entry.title}</AppText>
        <StyledFeather
          className="text-muted"
          name={isOpen ? 'chevron-down' : 'chevron-right'}
          size={16}
        />
      </Pressable>

      {isOpen ? (
        <View
          className="w-full overflow-hidden rounded-[20px] border border-foreground/10 bg-default"
          style={{ borderCurve: 'continuous' }}
        >
          <View className="flex-row items-center justify-between border-b border-foreground/10 px-3 py-2.5">
            <AppText className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
              {getToolPanelLabel(entry.toolName)}
            </AppText>
            {copyText ? (
              <Pressable
                accessibilityLabel={copied ? 'Copied tool output' : 'Copy tool output'}
                android_ripple={{ color: 'transparent' }}
                style={{ borderCurve: 'continuous' }}
                onPress={handleCopy}
              >
                <AppText className="text-[12px] font-medium text-foreground">
                  {copied ? 'Copied' : 'Copy'}
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <View className="w-full gap-3 px-3 py-3">
            <ToolContentPreview entry={entry} />
            <View className="flex-row items-center justify-end gap-1.5">
              <StyledFeather
                className={entry.status === 'error' ? 'text-red-500' : 'text-foreground/70'}
                name={
                  entry.status === 'running'
                    ? 'loader'
                    : entry.status === 'error'
                      ? 'alert-circle'
                      : 'check'
                }
                size={14}
              />
              <AppText
                className={
                  entry.status === 'error'
                    ? 'text-[11px] font-medium text-red-500'
                    : 'text-[11px] font-medium text-muted'
                }
              >
                {entry.status === 'running'
                  ? 'Running'
                  : entry.status === 'error'
                    ? 'Error'
                    : 'Success'}
              </AppText>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TraceContent({ item }: { item: Exclude<WorkingTraceItem, WorkingToolEntry> }) {
  if (item.type === 'assistant_note') {
    return (
      <View className="w-full pb-3">
        <ThreadTranscriptMarkdown compact>{item.body}</ThreadTranscriptMarkdown>
      </View>
    );
  }

  if (item.format === 'markdown') {
    return (
      <View className="w-full pb-3">
        <ThreadTranscriptMarkdown compact>{item.body}</ThreadTranscriptMarkdown>
      </View>
    );
  }

  return (
    <View className="w-full gap-1 pb-3">
      {item.title ? (
        <AppText className="text-[13px] font-medium leading-5 text-foreground">
          {item.title}
        </AppText>
      ) : null}
      {item.body ? (
        <AppText className="text-[13px] leading-5 text-foreground/80">{item.body}</AppText>
      ) : null}
    </View>
  );
}

function TraceItemView({ item }: { item: WorkingTraceItem }) {
  if (item.type === 'tool') {
    return <ToolTraceItem entry={item} />;
  }

  return <TraceContent item={item} />;
}

export function ThreadWorkingTrace({ label, live, model }: ThreadWorkingTraceProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="w-full gap-3">
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: 'transparent' }}
        className="flex-row items-center gap-1.5 self-start"
        style={{ borderCurve: 'continuous' }}
        onPress={() => {
          setIsOpen((current) => !current);
        }}
      >
        <AppText className="text-[14px] font-medium text-foreground">{label}</AppText>
        {live ? <StyledFeather className="text-foreground/70" name="loader" size={14} /> : null}
        <StyledFeather
          className="text-muted"
          name={isOpen ? 'chevron-down' : 'chevron-right'}
          size={16}
        />
      </Pressable>

      {isOpen ? (
        model.items.length > 0 ? (
          <View className="w-full gap-1">
            {model.items.map((item) => (
              <TraceItemView key={item.id} item={item} />
            ))}
          </View>
        ) : (
          <AppText className="text-[12px] text-muted">No working details captured.</AppText>
        )
      ) : null}
    </View>
  );
}
