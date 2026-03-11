import * as Clipboard from 'expo-clipboard';
import { useToast } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';


import type { BranchNavigatorState } from '@/lib/messages/session-tree';
import type { MessageNode, UserMessage } from '@ank1015/llm-sdk';

import { AppText } from '@/components/app-text';
import { ThreadActionButton } from '@/components/projects/thread/thread-action-button';
import { ThreadMarkdown } from '@/components/projects/thread/thread-markdown';
import { getTextFromUserMessage } from '@/lib/messages/utils';
import { useChatSettingsStore, useChatStore, useComposerStore } from '@/stores';

type ThreadUserMessageProps = {
  artifactId: string;
  branchState: BranchNavigatorState | null;
  projectId: string;
  sessionId: string;
  userNode: MessageNode;
};

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }

  return false;
}

export function ThreadUserMessage({
  artifactId,
  branchState,
  projectId,
  sessionId,
  userNode,
}: ThreadUserMessageProps) {
  const { toast } = useToast();
  const userMessage = userNode.message as UserMessage;
  const text = useMemo(() => getTextFromUserMessage(userMessage), [userMessage]);
  const [copied, setCopied] = useState(false);
  const beginEdit = useComposerStore((state) => state.beginEdit);
  const requestFocus = useComposerStore((state) => state.requestFocus);
  const retryFromNode = useChatStore((state) => state.retryFromNode);
  const setVisibleLeafNode = useChatStore((state) => state.setVisibleLeafNode);
  const isStreaming = useChatStore((state) => state.isStreamingBySession[sessionId] ?? false);
  const selectedApi = useChatSettingsStore((state) => state.api);
  const selectedModelId = useChatSettingsStore((state) => state.modelId);
  const selectedReasoning = useChatSettingsStore((state) => state.reasoning);

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
    if (!text) {
      return;
    }

    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
    });
  };

  const handleEdit = () => {
    if (!text || isStreaming) {
      return;
    }

    const session = { sessionId };

    beginEdit({
      originalText: text,
      session,
      targetNodeId: userNode.id,
    });
    requestFocus(session);
  };

  const handleRetry = () => {
    if (isStreaming) {
      return;
    }

    void retryFromNode({
      api: selectedApi,
      artifactId,
      modelId: selectedModelId,
      nodeId: userNode.id,
      projectId,
      reasoningLevel: selectedReasoning,
      sessionId,
    }).catch((error) => {
      if (isAbortError(error)) {
        return;
      }

      toast.show({
        variant: 'danger',
        label: 'Retry failed',
        description: error instanceof Error ? error.message : 'Failed to retry message.',
      });
    });
  };

  const handleSwitchBranch = (leafNodeId: string | null) => {
    if (!leafNodeId || isStreaming) {
      return;
    }

    setVisibleLeafNode({
      leafNodeId,
      session: { sessionId },
    });
  };

  return (
    <View className="w-full items-end gap-1.5">
      {text ? (
        <View
          className="max-w-[82%] rounded-[24px] bg-foreground/6 px-4 py-3"
          style={{ borderCurve: 'continuous' }}
        >
          <ThreadMarkdown>{text}</ThreadMarkdown>
        </View>
      ) : null}

      <View className="mr-1 flex-row items-center gap-1">
        <ThreadActionButton
          accessibilityLabel={copied ? 'Copied message' : 'Copy message'}
          icon={copied ? 'check' : 'copy'}
          onPress={handleCopy}
        />
        <ThreadActionButton
          accessibilityLabel="Edit message"
          disabled={!text || isStreaming}
          icon="edit-2"
          onPress={handleEdit}
        />
        <ThreadActionButton
          accessibilityLabel="Retry message"
          disabled={isStreaming}
          icon="refresh-cw"
          onPress={handleRetry}
        />
        {branchState ? (
          <View className="flex-row items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5">
            <ThreadActionButton
              accessibilityLabel="Show previous branch version"
              disabled={!branchState.previousLeafNodeId || isStreaming}
              icon="chevron-left"
              onPress={() => {
                handleSwitchBranch(branchState.previousLeafNodeId);
              }}
            />
            <AppText
              className="text-[12px] font-medium text-muted"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {branchState.currentIndex}/{branchState.total}
            </AppText>
            <ThreadActionButton
              accessibilityLabel="Show next branch version"
              disabled={!branchState.nextLeafNodeId || isStreaming}
              icon="chevron-right"
              onPress={() => {
                handleSwitchBranch(branchState.nextLeafNodeId);
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
