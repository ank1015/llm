"use client";

import { useEffect, useRef, useState } from "react";

const TYPE_INTERVAL_MS = 26;
const TYPE_START_DELAY_MS = 70;

function shouldAnimateNameChange(previousName: string, nextName: string): boolean {
  return /^new chat$/i.test(previousName.trim()) && previousName.trim() !== nextName.trim();
}

export function TypewriterSessionName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const [displayName, setDisplayName] = useState(name);
  const [isTyping, setIsTyping] = useState(false);
  const previousNameRef = useRef(name);

  useEffect(() => {
    const previousName = previousNameRef.current;

    if (previousName === name) {
      return;
    }

    previousNameRef.current = name;

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const frame = window.requestAnimationFrame(() => {
        setDisplayName(name);
        setIsTyping(false);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    if (!shouldAnimateNameChange(previousName, name)) {
      const frame = window.requestAnimationFrame(() => {
        setDisplayName(name);
        setIsTyping(false);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    let nextIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let startFrame: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }

      nextIndex += 1;
      setDisplayName(name.slice(0, nextIndex));

      if (nextIndex < name.length) {
        timeoutId = setTimeout(tick, TYPE_INTERVAL_MS);
        return;
      }

      setIsTyping(false);
    };

    startFrame = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }

      setDisplayName("");
      setIsTyping(true);
      timeoutId = setTimeout(tick, TYPE_START_DELAY_MS);
    });

    return () => {
      cancelled = true;

      if (startFrame !== null) {
        window.cancelAnimationFrame(startFrame);
      }

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [name]);

  return (
    <span className={className} title={name}>
      {displayName}
      {isTyping ? <span className="ml-px inline-block opacity-60">|</span> : null}
    </span>
  );
}
