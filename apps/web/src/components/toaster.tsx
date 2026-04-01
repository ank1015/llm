"use client";

import { Toaster as Sonner } from "sonner";

import { useUiStore } from "@/stores/ui-store";

export function Toaster() {
  const theme = useUiStore((state) => state.theme);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      expand={false}
      closeButton={false}
      toastOptions={{
        className:
          "border-black/8 bg-white text-black shadow-[0_16px_44px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#161616] dark:text-white",
      }}
    />
  );
}
