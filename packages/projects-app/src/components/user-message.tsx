'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';

import { ChatMarkdown } from './markdown-renderer';

import type { UserMessage } from '@ank1015/llm-sdk';

import { getTextFromUserMessage } from '@/lib/messages/utils';

export const UserMessageComponent = ({ userMessage }: { userMessage: UserMessage }) => {
  const text = getTextFromUserMessage(userMessage);
  const [copied, setCopied] = useState(false);

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
      </div>
    </div>
  );
};
