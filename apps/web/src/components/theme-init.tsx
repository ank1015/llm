"use client";

import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";

function resolveTheme(): "light" | "dark" {
  const storedTheme = window.localStorage.getItem("theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeInit() {
  const hydrateTheme = useUiStore((state) => state.hydrateTheme);

  useEffect(() => {
    hydrateTheme(resolveTheme());
  }, [hydrateTheme]);

  return null;
}
