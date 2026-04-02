'use client';

import { ArrowLeft01Icon, ComputerTerminal01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ArtifactContext } from '@/lib/client-api';

import { ArtifactCheckpointControls } from '@/components/artifact-checkpoint-controls';
import { ArtifactCommandMenu } from '@/components/artifact-command-menu';
import {
  ArtifactPreviewDrawer,
  getClampedArtifactDrawerWidth,
} from '@/components/artifact-workspace';
import { ProjectHeaderBreadcrumb } from '@/components/project-header-breadcrumb';
import { ProjectSidebar } from '@/components/project-sidebar';
import { ProjectTerminalPanel } from '@/components/project-terminal-panel';
import {
  getProjectSettingsReturnPathStorageKey,
  SettingsButton,
} from '@/components/settings-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useArtifactFilesStore } from '@/stores/artifact-files-store';
import { useTerminalStore } from '@/stores/terminals-store';


const DEFAULT_DRAWER_RATIO = 0.5;
const MIN_DRAWER_WIDTH = 320;
const DRAWER_RATIO_STORAGE_KEY = 'artifact-file-drawer-ratio';
const MAX_DRAWER_WIDTH_RATIO = 0.66;
const TERMINAL_SHORTCUT_LABEL = 'Ctrl+`';

function clampDrawerRatio(nextRatio: number): number {
  if (!Number.isFinite(nextRatio)) {
    return DEFAULT_DRAWER_RATIO;
  }

  return Math.min(MAX_DRAWER_WIDTH_RATIO, Math.max(MIN_DRAWER_WIDTH / 1440, nextRatio));
}

function getInitialDrawerRatio(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_DRAWER_RATIO;
  }

  const stored = window.localStorage.getItem(DRAWER_RATIO_STORAGE_KEY);
  if (!stored) {
    return DEFAULT_DRAWER_RATIO;
  }

  const parsed = Number.parseFloat(stored);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DRAWER_RATIO;
  }

  return clampDrawerRatio(parsed);
}

export function ProjectLayoutShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { projectId, artifactId } = useParams<{
    projectId: string;
    artifactId?: string;
  }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [drawerRatio, setDrawerRatio] = useState(getInitialDrawerRatio);
  const [isDrawerResizing, setIsDrawerResizing] = useState(false);
  const artifactKey = artifactId ? `${projectId}::${artifactId}` : null;
  const previewMode = useArtifactFilesStore((state) =>
    artifactKey ? (state.previewModeByArtifact[artifactKey] ?? null) : null
  );
  const terminalDockOpen = useTerminalStore((state) =>
    artifactKey ? (state.dockByArtifact[artifactKey]?.open ?? false) : false
  );
  const toggleTerminalDock = useTerminalStore((state) => state.toggleDock);
  const drawerVisible = Boolean(artifactId && previewMode);
  const artifactContext = useMemo<ArtifactContext | null>(
    () =>
      artifactId
        ? {
            projectId,
            artifactId,
          }
        : null,
    [artifactId, projectId]
  );
  const isSettingsRoute =
    pathname === `/${projectId}/settings` || pathname.startsWith(`/${projectId}/settings/`);
  const terminalAvailable = Boolean(artifactId && !isSettingsRoute);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(DRAWER_RATIO_STORAGE_KEY, `${drawerRatio}`);
  }, [drawerRatio]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(container);
    setContainerWidth(container.getBoundingClientRect().width);

    return () => {
      observer.disconnect();
    };
  }, []);

  const drawerWidth =
    artifactContext && containerWidth > 0
      ? getClampedArtifactDrawerWidth(containerWidth, drawerRatio)
      : 0;

  return (
    <div className="bg-home-page flex h-[100dvh] w-full min-w-0 overflow-hidden transition-colors">
      <ProjectSidebar />

      <div ref={containerRef} className="relative flex h-[100dvh] min-w-0 flex-1 overflow-hidden">
        <div
          className={[
            'flex min-w-0 flex-1 flex-col overflow-hidden transition-[padding-right] ease-out',
            isDrawerResizing ? 'duration-0' : 'duration-300',
          ].join(' ')}
          style={{ paddingRight: drawerVisible ? `${drawerWidth + 4}px` : '0px' }}
        >
          <header className="flex h-12 shrink-0 items-center gap-3 px-3">
            {isSettingsRoute ? (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const storageKey = getProjectSettingsReturnPathStorageKey(projectId);
                    const returnPath = window.sessionStorage.getItem(storageKey);

                    if (
                      returnPath &&
                      returnPath.startsWith(`/${projectId}`) &&
                      !returnPath.startsWith(`/${projectId}/settings`)
                    ) {
                      window.sessionStorage.removeItem(storageKey);
                      router.push(returnPath);
                      return;
                    }
                  }

                  router.push(`/${projectId}`);
                }}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/60 transition-colors hover:bg-accent hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/62 dark:hover:bg-accent dark:hover:text-white dark:focus-visible:ring-white/12"
                aria-label="Go back"
                title="Back"
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={18}
                  color="currentColor"
                  strokeWidth={1.8}
                />
              </button>
            ) : (
              <ProjectHeaderBreadcrumb />
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              {artifactContext && !isSettingsRoute ? (
                <ArtifactCheckpointControls
                  artifactContext={artifactContext}
                  compact={drawerVisible}
                />
              ) : null}
              {terminalAvailable ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!artifactContext) {
                      return;
                    }

                    void Promise.resolve(toggleTerminalDock(artifactContext)).catch(
                      () => undefined
                    );
                  }}
                  className={[
                    'inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:focus-visible:ring-white/12',
                    terminalDockOpen
                      ? 'bg-black/[0.06] text-black dark:bg-white/[0.08] dark:text-white'
                      : 'text-black/60 hover:bg-accent hover:text-black dark:text-white/62 dark:hover:bg-accent dark:hover:text-white',
                  ].join(' ')}
                  aria-label={`Toggle terminal (${TERMINAL_SHORTCUT_LABEL})`}
                  title={`Toggle terminal (${TERMINAL_SHORTCUT_LABEL})`}
                >
                  <HugeiconsIcon
                    icon={ComputerTerminal01Icon}
                    size={18}
                    color="currentColor"
                    strokeWidth={1.8}
                  />
                </button>
              ) : null}
              <ThemeToggle />
              {!isSettingsRoute ? (
                <SettingsButton href={`/${projectId}/settings`} projectId={projectId} />
              ) : null}
            </div>
          </header>

          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>

          {artifactContext && !isSettingsRoute ? (
            <ArtifactCommandMenu
              key={`${artifactContext.projectId}:${artifactContext.artifactId}`}
              enabled
              projectId={artifactContext.projectId}
              artifactId={artifactContext.artifactId}
            />
          ) : null}

          {terminalAvailable && artifactContext ? (
            <ProjectTerminalPanel artifactContext={artifactContext} />
          ) : null}
        </div>

        {artifactContext ? (
          <ArtifactPreviewDrawer
            artifactContext={artifactContext}
            containerRef={containerRef}
            drawerWidth={drawerWidth}
            isOpen={drawerVisible}
            isResizing={isDrawerResizing}
            onResizingChange={setIsDrawerResizing}
            setDrawerRatio={setDrawerRatio}
          />
        ) : null}
      </div>
    </div>
  );
}
