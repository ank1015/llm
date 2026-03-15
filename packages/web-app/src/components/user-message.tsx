'use client';

import { Check, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { ChatMarkdown } from './markdown-renderer';

import type { BranchNavigatorState } from '@/lib/messages/session-tree';
import type { MessageNode, UserMessage } from '@ank1015/llm-types';

import { getTextFromUserMessage } from '@/lib/messages/utils';
import { useChatSettingsStore, useChatStore, useComposerStore } from '@/stores';

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }
  return false;
}

function focusComposer(): void {
  window.requestAnimationFrame(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-chat-composer-textarea]');
    if (!textarea) {
      return;
    }

    textarea.focus();
    const cursor = textarea.value.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

export const UserMessageComponent = ({
  userNode,
  branchState,
}: {
  userNode: MessageNode;
  branchState: BranchNavigatorState | null;
}) => {
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId: string;
    threadId?: string;
  }>();
  const userMessage = userNode.message as UserMessage;
  const text = getTextFromUserMessage(userMessage);
  const [copied, setCopied] = useState(false);
  const beginEdit = useComposerStore((state) => state.beginEdit);
  const retryFromNode = useChatStore((state) => state.retryFromNode);
  const setVisibleLeafNode = useChatStore((state) => state.setVisibleLeafNode);
  const isStreaming = useChatStore((state) => {
    if (!threadId) return false;
    return state.isStreamingBySession[threadId] ?? false;
  });
  const selectedApi = useChatSettingsStore((state) => state.api);
  const selectedModelId = useChatSettingsStore((state) => state.modelId);
  const selectedReasoning = useChatSettingsStore((state) => state.reasoning);

  const handleCopy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [text]);

  const handleEdit = useCallback(() => {
    if (!text || !threadId) return;

    beginEdit({
      session: { sessionId: threadId },
      targetNodeId: userNode.id,
      originalText: text,
    });
    focusComposer();
  }, [beginEdit, text, threadId, userNode.id]);

  const handleRetry = useCallback(async () => {
    if (!threadId || isStreaming) return;

    try {
      await retryFromNode({
        sessionId: threadId,
        nodeId: userNode.id,
        projectId,
        artifactId,
        api: selectedApi,
        modelId: selectedModelId,
        reasoningLevel: selectedReasoning,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      const message = error instanceof Error ? error.message : 'Failed to retry message.';
      toast.error(message, {
        id: 'message-retry-error',
      });
    }
  }, [
    artifactId,
    isStreaming,
    projectId,
    retryFromNode,
    selectedApi,
    selectedModelId,
    selectedReasoning,
    threadId,
    userNode.id,
  ]);

  const handleSwitchBranch = useCallback(
    (leafNodeId: string | null) => {
      if (!threadId || !leafNodeId || isStreaming) {
        return;
      }

      setVisibleLeafNode({
        session: { sessionId: threadId },
        leafNodeId,
      });
    },
    [isStreaming, setVisibleLeafNode, threadId]
  );

  return (
    <div className="group/user flex w-full flex-col items-end gap-1">
      {text && (
        <div className="bg-home-hover text-foreground max-w-[70%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed">
          <ChatMarkdown>{text}</ChatMarkdown>
        </div>
      )}

      <div className="mr-1 mt-0.5 flex h-5 items-center gap-0.5 opacity-0 transition-opacity group-hover/user:opacity-100">
        <button
          type="button"
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors"
          aria-label={copied ? 'Copied' : 'Copy message'}
        >
          {copied ? <Check className="size-3.5 text-blue-500" /> : <Copy className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleEdit}
          disabled={!text || isStreaming}
          className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 cursor-pointer rounded p-1 transition-colors disabled:cursor-default"
          aria-label="Edit message"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isStreaming}
          className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 cursor-pointer rounded p-1 transition-colors disabled:cursor-default"
          aria-label="Retry message"
        >
          <RefreshCw className="size-3.5" />
        </button>
        {branchState ? (
          <div className="text-muted-foreground flex items-center gap-0.5 pl-0.5">
            <button
              type="button"
              onClick={() => handleSwitchBranch(branchState.previousLeafNodeId)}
              disabled={!branchState.previousLeafNodeId || isStreaming}
              className="hover:text-foreground disabled:text-muted-foreground/40 cursor-pointer rounded p-0.5 transition-colors disabled:cursor-default"
              aria-label="Show previous branch version"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-[12px] font-medium tabular-nums">
              {branchState.currentIndex}/{branchState.total}
            </span>
            <button
              type="button"
              onClick={() => handleSwitchBranch(branchState.nextLeafNodeId)}
              disabled={!branchState.nextLeafNodeId || isStreaming}
              className="hover:text-foreground disabled:text-muted-foreground/40 cursor-pointer rounded p-0.5 transition-colors disabled:cursor-default"
              aria-label="Show next branch version"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
