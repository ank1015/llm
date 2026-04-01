"use client";

import { Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function getProjectSettingsReturnPathStorageKey(projectId: string): string {
  return `project-settings-return-path:${projectId}`;
}

export function SettingsButton({
  href,
  projectId,
}: {
  href: string;
  projectId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [rotation, setRotation] = useState(0);

  return (
    <button
      type="button"
      onClick={() => {
        setRotation((current) => current + 90);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            getProjectSettingsReturnPathStorageKey(projectId),
            pathname,
          );
        }
        router.push(href);
      }}
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-[color,background-color,transform] duration-300 focus-visible:outline-none focus-visible:ring-2"
      aria-label="Open settings"
      title="Settings"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <HugeiconsIcon icon={Settings02Icon} size={18} color="currentColor" strokeWidth={1.8} />
    </button>
  );
}
