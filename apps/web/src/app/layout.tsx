import type { Metadata } from 'next';
import Script from 'next/script';
import '@xterm/xterm/css/xterm.css';
import 'katex/dist/katex.min.css';

import { QueryProvider } from '@/components/query-provider';
import { ThemeInit } from '@/components/theme-init';
import { Toaster } from '@/components/toaster';

import './globals.css';

export const metadata: Metadata = {
  title: 'LLM Stack',
  description: 'Refactored web client for the LLM stack',
};

const themeInitScript = `
(() => {
  try {
    const storedTheme = window.localStorage.getItem("theme");
    const theme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-[100dvh] font-sans antialiased">
        <QueryProvider>
          <ThemeInit />
          <Toaster />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
