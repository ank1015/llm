'use client';

import { useEffect, useMemo, useState } from 'react';

import { useUiStore } from '@/stores/ui-store';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'chat-app-theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);
}

export function AppShell(): React.ReactElement {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const isMobileSidebarOpen = useUiStore((state) => state.isMobileSidebarOpen);
  const isSettingsOpen = useUiStore((state) => state.isSettingsOpen);
  const activeSettingsTab = useUiStore((state) => state.activeSettingsTab);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const toggleMobileSidebar = useUiStore((state) => state.toggleMobileSidebar);
  const closeMobileSidebar = useUiStore((state) => state.closeMobileSidebar);
  const openSettings = useUiStore((state) => state.openSettings);
  const closeSettings = useUiStore((state) => state.closeSettings);
  const setActiveSettingsTab = useUiStore((state) => state.setActiveSettingsTab);

  const [theme, setTheme] = useState<ThemeMode>('light');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const resolvedTheme = isThemeMode(savedTheme) ? savedTheme : getSystemTheme();

    setTheme(resolvedTheme);
    applyTheme(resolvedTheme);
  }, []);

  const toggleTheme = (): void => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';

    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  const sidebarClassName = useMemo(() => {
    if (isSidebarCollapsed) {
      return 'w-20';
    }

    return 'w-72';
  }, [isSidebarCollapsed]);

  return (
    <div className="relative flex min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]">
      <aside
        className={`hidden h-screen shrink-0 border-r border-[var(--border-default)] bg-[var(--surface-panel)] p-3 md:flex md:flex-col ${sidebarClassName}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          {!isSidebarCollapsed ? <p className="text-sm font-semibold">Sessions</p> : null}
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs hover:bg-[var(--surface-muted)]"
          >
            {isSidebarCollapsed ? '>' : '<'}
          </button>
        </div>

        <button
          type="button"
          className="mb-3 rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]"
        >
          {isSidebarCollapsed ? '+' : '+ New chat'}
        </button>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {Array.from({ length: 5 }).map((_, index) => (
            <button
              key={index}
              type="button"
              className="block w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-3 py-2 text-left text-sm hover:border-[var(--border-default)]"
            >
              {isSidebarCollapsed ? `#${index + 1}` : `Conversation ${index + 1}`}
            </button>
          ))}
        </div>
      </aside>

      {isMobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-20 bg-black/35 md:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 border-r border-[var(--border-default)] bg-[var(--surface-panel)] p-3 transition-transform duration-200 md:hidden ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Sessions</p>
          <button
            type="button"
            onClick={closeMobileSidebar}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>

        <button
          type="button"
          className="mb-3 w-full rounded-md border border-dashed border-[var(--border-default)] px-3 py-2 text-left text-sm"
        >
          + New chat
        </button>

        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-canvas)] px-3 py-2 text-sm"
            >
              Conversation {index + 1}
            </div>
          ))}
        </div>
      </aside>

      <div className="relative flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-4">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs md:hidden"
          >
            Menu
          </button>

          <h1 className="text-sm font-semibold">LLM Chat App</h1>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
            >
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>
            <button
              type="button"
              onClick={() => openSettings('general')}
              className="rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs hover:bg-[var(--surface-muted)]"
            >
              Settings
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mx-auto w-full max-w-3xl space-y-4">
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
                  <p className="mb-1 text-xs text-[var(--text-muted)]">Assistant</p>
                  <p className="text-sm">
                    Welcome. Select a chat from the sidebar or start a new one.
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
                  <p className="mb-1 text-xs text-[var(--text-muted)]">User</p>
                  <p className="text-sm">Show me how this shell is wired to the stores.</p>
                </div>
              </div>
            </div>

            <footer className="border-t border-[var(--border-default)] bg-[var(--surface-panel)] p-4">
              <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
                <textarea
                  rows={1}
                  placeholder="Type a message..."
                  className="max-h-36 min-h-11 flex-1 resize-y rounded-lg border border-[var(--border-default)] bg-[var(--surface-canvas)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Send
                </button>
              </div>
            </footer>
          </section>
        </main>
      </div>

      {isSettingsOpen ? (
        <button
          type="button"
          aria-label="Close settings"
          onClick={closeSettings}
          className="fixed inset-0 z-20 bg-black/20"
        />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-30 flex h-screen w-[320px] flex-col border-l border-[var(--border-default)] bg-[var(--surface-panel)] transition-transform duration-200 ${
          isSettingsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <h2 className="text-sm font-semibold">Settings</h2>
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-md border border-[var(--border-default)] px-2 py-1 text-xs"
          >
            Close
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--border-default)] px-3 py-2">
          {(['general', 'model', 'keys'] as const).map((tab) => {
            const selected = activeSettingsTab === tab;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveSettingsTab(tab)}
                className={`rounded-md px-3 py-1.5 text-xs capitalize ${
                  selected
                    ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-canvas)]'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        <div className="space-y-3 p-4 text-sm">
          {activeSettingsTab === 'general' ? (
            <>
              <p className="font-medium">General</p>
              <p className="text-[var(--text-muted)]">
                Theme, defaults, and session preferences will live here.
              </p>
            </>
          ) : null}

          {activeSettingsTab === 'model' ? (
            <>
              <p className="font-medium">Model</p>
              <p className="text-[var(--text-muted)]">
                Provider and model selection UI will be connected next.
              </p>
            </>
          ) : null}

          {activeSettingsTab === 'keys' ? (
            <>
              <p className="font-medium">API Keys</p>
              <p className="text-[var(--text-muted)]">
                Per-provider key management panel goes here.
              </p>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
