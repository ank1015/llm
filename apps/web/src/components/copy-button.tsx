"use client";

import { CheckmarkCircle02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  className,
  ariaLabel,
  title,
}: {
  text: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!text.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-colors",
        className,
      )}
      aria-label={copied ? "Copied" : (ariaLabel ?? "Copy")}
      title={copied ? "Copied" : (title ?? ariaLabel ?? "Copy")}
    >
      <HugeiconsIcon
        icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
        size={14}
        color="currentColor"
        strokeWidth={1.8}
      />
    </button>
  );
}
