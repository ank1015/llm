"use client";

import { Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { useUiStore } from "@/stores/ui-store";

export function ThemeToggle() {
  const isThemeHydrated = useUiStore((state) => state.isThemeHydrated);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);

  if (!isThemeHydrated) {
    return <span aria-hidden="true" className="inline-flex size-8 rounded-md" />;
  }

  const icon = theme === "light" ? Moon02Icon : Sun01Icon;
  const nextThemeLabel = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
      aria-label={`Switch to ${nextThemeLabel} theme`}
      title="Toggle theme"
    >
      <HugeiconsIcon icon={icon} size={theme === 'dark' ? 20 : 18} color="currentColor" strokeWidth={1.8} />
    </button>
  );
}
