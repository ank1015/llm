'use client';

import { Check, Copy, Pencil, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { ChatMarkdown } from './markdown-renderer';

import type { UserMessage } from '@ank1015/llm-sdk';

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

export const UserMessageComponent = ({ userMessage }: { userMessage: UserMessage }) => {
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId: string;
    threadId?: string;
  }>();
  const text = getTextFromUserMessage(userMessage);
  const [copied, setCopied] = useState(false);
  const setDraft = useComposerStore((state) => state.setDraft);
  const startStream = useChatStore((state) => state.startStream);
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

    setDraft({
      session: { sessionId: threadId },
      draft: text,
    });
    focusComposer();
  }, [setDraft, text, threadId]);

  const handleRetry = useCallback(async () => {
    if (!text || !threadId || isStreaming) return;

    try {
      await startStream({
        sessionId: threadId,
        prompt: text,
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
    selectedApi,
    selectedModelId,
    selectedReasoning,
    startStream,
    text,
    threadId,
  ]);

  return (
    <div className="group/user flex w-full flex-col items-end gap-1">
      {text && (
        <div className="bg-home-hover text-foreground max-w-[70%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed">
          <ChatMarkdown>{text}</ChatMarkdown>
        </div>
      )}

      {/* Action buttons — visible on hover */}
      <div className="mr-1 flex h-6 items-center gap-1 opacity-0 transition-opacity group-hover/user:opacity-100">
        <button
          type="button"
          onClick={handleCopy}
          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
          aria-label={copied ? 'Copied' : 'Copy message'}
        >
          {copied ? <Check className="size-4 text-blue-500" /> : <Copy className="size-4" />}
        </button>
        <button
          type="button"
          onClick={handleEdit}
          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1.5 transition-colors"
          aria-label="Edit message"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleRetry}
          disabled={isStreaming}
          className="text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 cursor-pointer rounded p-1.5 transition-colors disabled:cursor-default"
          aria-label="Retry message"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
    </div>
  );
};
