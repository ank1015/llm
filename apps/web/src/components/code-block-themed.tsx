"use client";

import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";

import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type CodeBlockThemedProps = {
  code: string;
  language?: string;
  className?: string;
};

function normalizeLanguage(language?: string): string {
  const value = (language ?? "plaintext").trim().toLowerCase();

  switch (value) {
    case "js":
      return "javascript";
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "jsx":
      return "jsx";
    case "sh":
      return "bash";
    case "md":
      return "markdown";
    case "yml":
      return "yaml";
    case "env":
      return "dotenv";
    default:
      return value || "plaintext";
  }
}

export function CodeBlockThemed({
  code,
  language = "plaintext",
  className,
}: CodeBlockThemedProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const trimmedCode = useMemo(() => code.replace(/\n$/, ""), [code]);
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const displayLanguage = normalizedLanguage === "plaintext" ? "" : normalizedLanguage;

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!trimmedCode) {
        setHighlightedHtml("<pre><code></code></pre>");
        return;
      }

      try {
        const html = await codeToHtml(trimmedCode, {
          lang: normalizedLanguage,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        });
        if (!cancelled) {
          setHighlightedHtml(html);
        }
      } catch {
        try {
          const html = await codeToHtml(trimmedCode, {
            lang: "plaintext",
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: false,
          });
          if (!cancelled) {
            setHighlightedHtml(html);
          }
        } catch {
          if (!cancelled) {
            setHighlightedHtml(null);
          }
        }
      }
    }

    void highlight();
    return () => {
      cancelled = true;
    };
  }, [normalizedLanguage, trimmedCode]);

  return (
    <div className={cn("border-home-border my-5 overflow-hidden rounded-lg border", className)}>
      <div className="border-home-border bg-home-panel flex items-center justify-between border-b px-4 py-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide">
          {displayLanguage}
        </span>
        <CopyButton text={trimmedCode} />
      </div>

      {highlightedHtml ? (
        <div
          className="bg-home-panel w-full overflow-x-auto text-[13px] leading-relaxed [&>pre]:min-w-fit [&>pre]:px-4 [&>pre]:py-3"
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
