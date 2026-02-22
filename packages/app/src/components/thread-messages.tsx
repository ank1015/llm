'use client';

import { Check, Copy } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import type { MockMessage } from '@/lib/mock-data';

/* ------------------------------------------------------------------ */
/*  UserMessage                                                        */
/* ------------------------------------------------------------------ */

const UserMessage = memo(function UserMessage({ message }: { message: MockMessage }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [message.content]);

  return (
    <div className="group/user flex w-full flex-col items-end gap-1">
      <div className="bg-home-hover text-foreground max-w-[70%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed">
        {message.content}
      </div>
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
});

/* ------------------------------------------------------------------ */
/*  AssistantMessage                                                    */
/* ------------------------------------------------------------------ */

const AssistantMessage = memo(function AssistantMessage({ message }: { message: MockMessage }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [message.content]);

  return (
    <div className="group/assistant flex w-full flex-col items-start gap-1">
      <div className="text-foreground max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed">
        {message.content}
      </div>
      <div className="ml-1 flex h-6 items-center gap-1 opacity-0 transition-opacity group-hover/assistant:opacity-100">
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
});

/* ------------------------------------------------------------------ */
/*  ThreadMessages                                                     */
/* ------------------------------------------------------------------ */

export function ThreadMessages({ messages }: { messages: MockMessage[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-start gap-6">
      {messages.map((message) =>
        message.role === 'user' ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage key={message.id} message={message} />
        )
      )}
    </div>
  );
}
