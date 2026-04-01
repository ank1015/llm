"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";

export function ArtifactDialogFrame({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/24 px-4 backdrop-blur-[10px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-[1.75rem] border border-black/8 bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#171717] dark:shadow-[0_18px_48px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-black dark:text-white">{title}</h2>
          <p className="text-sm leading-6 text-black/52 dark:text-white/54">{description}</p>
        </div>

        <div className="mt-5">{children}</div>

        <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
