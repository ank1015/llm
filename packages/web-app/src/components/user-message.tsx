'use client';

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { ChatMarkdown } from './markdown-renderer';

import type { BranchNavigatorState } from '@/lib/messages/session-tree';
import type { MessageNode, UserMessage } from '@ank1015/llm-types';

import { getArtifactRawFileUrl } from '@/lib/client-api';
import { getTextFromUserMessage, hasVisibleAttachmentInUserMessage } from '@/lib/messages/utils';
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

function formatAttachmentSize(size: unknown): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentMetadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
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
  const hasVisibleAttachments = hasVisibleAttachmentInUserMessage(userMessage);
  const attachmentBlocks = userMessage.content.filter(
    (block): block is Extract<UserMessage['content'][number], { type: 'image' | 'file' }> => {
      return block.type === 'image' || block.type === 'file';
    }
  );
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
    if (!threadId) return;

    beginEdit({
      session: { sessionId: threadId },
      targetNodeId: userNode.id,
      originalText: text,
      hasFixedAttachments: hasVisibleAttachments,
    });
    focusComposer();
  }, [beginEdit, hasVisibleAttachments, text, threadId, userNode.id]);

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
      {attachmentBlocks.length > 0 ? (
        <div className="flex w-full max-w-[70%] flex-col items-end gap-2">
          {attachmentBlocks.map((block, index) => {
            const fileName =
              getAttachmentMetadataValue(block.metadata, 'originalFileName') ??
              getAttachmentMetadataValue(block.metadata, 'fileName') ??
              (block.type === 'file' ? block.filename : `image-${index + 1}`);
            const artifactRelativePath = getAttachmentMetadataValue(
              block.metadata,
              'artifactRelativePath'
            );
            const attachmentHref = artifactRelativePath
              ? getArtifactRawFileUrl(
                  { projectId, artifactId },
                  {
                    path: artifactRelativePath,
                  }
                )
              : `data:${block.mimeType};base64,${block.data}`;
            const sizeLabel = formatAttachmentSize(block.metadata?.size);

            if (block.type === 'image') {
              return (
                <a
                  key={`${userMessage.id}-attachment-${index}`}
                  href={attachmentHref}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/4"
                >
                  <img
                    src={`data:${block.mimeType};base64,${block.data}`}
                    alt={fileName}
                    className="max-h-80 w-auto max-w-full object-cover"
                  />
                </a>
              );
            }

            return (
              <a
                key={`${userMessage.id}-attachment-${index}`}
                href={attachmentHref}
                target="_blank"
                rel="noreferrer"
                className="bg-home-hover hover:bg-home-hover/80 text-foreground flex w-full items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 transition-colors"
              >
                <FileText className="size-5 shrink-0 text-red-300" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{fileName}</div>
                  <div className="text-muted-foreground text-xs">
                    PDF{sizeLabel ? ` • ${sizeLabel}` : ''}
                  </div>
                </div>
                <ExternalLink className="text-muted-foreground size-4 shrink-0" />
              </a>
            );
          })}
        </div>
      ) : null}

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
          disabled={isStreaming}
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
