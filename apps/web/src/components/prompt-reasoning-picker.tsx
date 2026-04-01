"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { ReasoningEffort } from "@ank1015/llm-sdk";

import { useChatSettingsStore } from "@/stores/chat-settings-store";

type MenuPosition = {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const REASONING_VALUES: readonly ReasoningEffort[] = ["low", "medium", "high", "xhigh"];
const MENU_WIDTH = 136;
const VIEWPORT_PADDING = 12;
const MAX_MENU_HEIGHT = 220;
const MIN_PREFERRED_MENU_HEIGHT = 140;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isSamePosition(
  left: MenuPosition | null,
  right: MenuPosition | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.top === right.top &&
    left.bottom === right.bottom &&
    left.left === right.left &&
    left.maxHeight === right.maxHeight
  );
}

export function PromptReasoningPicker() {
  const selectedReasoning = useChatSettingsStore((state) => state.reasoningEffort);
  const setReasoning = useChatSettingsStore((state) => state.setReasoning);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  function updateMenuPosition() {
    if (typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_PADDING;
    const shouldOpenAbove =
      spaceBelow < MIN_PREFERRED_MENU_HEIGHT && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      MAX_MENU_HEIGHT,
      Math.max(shouldOpenAbove ? spaceAbove : spaceBelow, 120),
    );
    const left = clamp(
      rect.left,
      VIEWPORT_PADDING,
      viewportWidth - MENU_WIDTH - VIEWPORT_PADDING,
    );

    setMenuPosition((current) => {
      const nextPosition = shouldOpenAbove
        ? {
            bottom: viewportHeight - rect.top,
            left,
            maxHeight,
          }
        : {
            top: rect.bottom,
            left,
            maxHeight,
          };

      return isSamePosition(current, nextPosition) ? current : nextPosition;
    });
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    updateMenuPosition();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Select reasoning effort"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }

          updateMenuPosition();
          setIsOpen(true);
        }}
        className="inline-flex h-7 min-w-[94px] max-w-[94px] shrink-0 items-center gap-0.5 rounded-md px-2 text-[13px] font-medium lowercase leading-[1.15] text-black/56 transition-colors hover:bg-accent hover:text-black/76 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/54 dark:hover:text-white/76 dark:focus-visible:ring-white/12"
        title={`Reasoning: ${selectedReasoning}`}
      >
        <span className="min-w-0 truncate">
          {selectedReasoning}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={13}
          color="currentColor"
          strokeWidth={1.9}
          className={[
            "ml-auto shrink-0 rotate-90 transition-transform",
            isOpen ? "rotate-[270deg]" : "rotate-90",
          ].join(" ")}
        />
      </button>

      {isOpen && menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[70]"
            >
              <div
                className="fixed overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#151515] dark:shadow-[0_14px_32px_rgba(0,0,0,0.24)]"
                style={{
                  left: menuPosition.left,
                  maxHeight: menuPosition.maxHeight,
                  ...(menuPosition.top !== undefined
                    ? { top: menuPosition.top }
                    : { bottom: menuPosition.bottom }),
                  width: MENU_WIDTH,
                }}
                role="menu"
                aria-label="Reasoning effort"
              >
                <div className="max-h-full overflow-y-auto p-1">
                  {REASONING_VALUES.map((value) => {
                    const isSelected = value === selectedReasoning;

                    return (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setReasoning(value);
                          setIsOpen(false);
                        }}
                        className={[
                          "flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] font-medium lowercase leading-[1.15] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:focus-visible:ring-white/12",
                          isSelected
                            ? "bg-accent text-black dark:text-white"
                            : "text-black/74 hover:bg-accent dark:text-white/74 dark:hover:text-white",
                        ].join(" ")}
                      >
                        <span className="truncate">{value}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
