'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/utils';

type CopyButtonProps = {
  text: string;
  className?: string;
};

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available in some contexts
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors',
        className
      )}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
    </button>
  );
}
