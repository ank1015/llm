'use client';

import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';

import { CopyButton } from './copy-button';

import { cn } from '@/lib/utils';

type CodeBlockThemedProps = {
  code: string;
  language?: string;
  className?: string;
};

export function CodeBlockThemed({ code, language = 'plaintext', className }: CodeBlockThemedProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const trimmedCode = code.replace(/\n$/, '');
  const displayLanguage = language === 'plaintext' ? '' : language;

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!trimmedCode) {
        setHighlightedHtml('<pre><code></code></pre>');
        return;
      }

      try {
        const html = await codeToHtml(trimmedCode, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        });
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        // If language isn't supported, fall back to plaintext
        try {
          const html = await codeToHtml(trimmedCode, {
            lang: 'plaintext',
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
          });
          if (!cancelled) setHighlightedHtml(html);
        } catch {
          // Give up on highlighting
        }
      }
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [trimmedCode, language]);

  return (
    <div className={cn('border-home-border my-3 overflow-hidden rounded-lg border', className)}>
      {/* Header: language label + copy button */}
      <div className="border-home-border bg-home-panel flex items-center justify-between border-b px-4 py-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide">
          {displayLanguage}
        </span>
        <CopyButton text={trimmedCode} />
      </div>

      {/* Code content */}
      {highlightedHtml ? (
        <div
          className="bg-home-panel w-full overflow-x-auto text-[13px] leading-relaxed [&>pre]:min-w-fit [&>pre]:px-4 [&>pre]:py-3"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <div className="bg-home-panel w-full overflow-x-auto text-[13px] leading-relaxed">
          <pre className="px-4 py-3">
            <code>{trimmedCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
