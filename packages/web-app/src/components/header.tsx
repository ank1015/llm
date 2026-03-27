'use client';

import { ChevronRight, FolderOpen, Moon, Sun, Terminal as TerminalIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import type { ProjectOverviewDto } from '@/lib/client-api';

import { Button } from '@/components/ui/button';
import { getProjectOverview } from '@/lib/client-api';
import { useTypewriter } from '@/lib/use-typewriter';
import { cn } from '@/lib/utils';
import { useSidebarStore, useTerminalStore, useUiStore } from '@/stores';
import { getTerminalArtifactKey } from '@/stores/terminals-store';

const EMPTY_ARTIFACT_DIRS: ProjectOverviewDto['artifactDirs'] = [];
const BREADCRUMB_LINK_TRANSITION_CLASS = 'hover:text-foreground transition-colors';
const ACTIVE_BREADCRUMB_LINK_CLASS = `text-foreground font-medium hover:text-foreground/80 transition-colors`;
const INACTIVE_BREADCRUMB_LINK_CLASS = `text-muted-foreground ${BREADCRUMB_LINK_TRANSITION_CLASS}`;
const TRUNCATED_BREADCRUMB_LABEL_CLASS = 'min-w-0 truncate';

function HeaderBreadcrumb() {
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId?: string;
    threadId?: string;
  }>();
  const pathname = usePathname();

  const [overview, setOverview] = useState<ProjectOverviewDto | null>(null);
  const sidebarProjectName = useSidebarStore((state) => state.projectName);
  const sidebarArtifactDirs = useSidebarStore((state) => state.artifactDirs ?? EMPTY_ARTIFACT_DIRS);

  useEffect(() => {
    if (!projectId) return;
    void getProjectOverview(projectId)
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [projectId]);

  const projectName = sidebarProjectName ?? overview?.project.name ?? projectId;
  const artifact = artifactId
    ? (sidebarArtifactDirs.find((dir) => dir.id === artifactId) ??
      overview?.artifactDirs.find((dir) => dir.id === artifactId))
    : undefined;
  const artifactName = artifact?.name ?? artifactId;

  const session =
    threadId && artifact ? artifact.sessions.find((s) => s.sessionId === threadId) : undefined;
  const threadName = useTypewriter(session?.sessionName ?? 'Session');
  const isArtifactsView = Boolean(artifactId && pathname.endsWith('/artifacts'));

  // Determine which segment is the last (active) one
  const lastSegment = threadId
    ? 'thread'
    : isArtifactsView
      ? 'artifacts'
      : artifactId
        ? 'artifact'
        : 'project';

  const linkClass = (active: boolean) =>
    active ? ACTIVE_BREADCRUMB_LINK_CLASS : INACTIVE_BREADCRUMB_LINK_CLASS;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-sm whitespace-nowrap">
      <Link href="/" className={`${INACTIVE_BREADCRUMB_LINK_CLASS} shrink-0`}>
        Projects
      </Link>
      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
      <Link
        href={`/${projectId}`}
        className={cn(linkClass(lastSegment === 'project'), TRUNCATED_BREADCRUMB_LABEL_CLASS)}
      >
        {projectName}
      </Link>
      {artifactId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          <Link
            href={`/${projectId}/${artifactId}`}
            className={cn(linkClass(lastSegment === 'artifact'), TRUNCATED_BREADCRUMB_LABEL_CLASS)}
          >
            {artifactName}
          </Link>
        </>
      )}
      {threadId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          <Link
            href={`/${projectId}/${artifactId}/${threadId}`}
            className={cn(linkClass(lastSegment === 'thread'), TRUNCATED_BREADCRUMB_LABEL_CLASS)}
          >
            {threadName}
          </Link>
        </>
      )}
      {isArtifactsView && artifactId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
          <Link
            href={`/${projectId}/${artifactId}/artifacts`}
            className={cn(linkClass(lastSegment === 'artifacts'), 'shrink-0')}
          >
            Artifacts
          </Link>
        </>
      )}
    </div>
  );
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { projectId, artifactId } = useParams<{ projectId: string; artifactId?: string }>();
  const artifactCtx = useMemo(
    () => (artifactId ? { projectId, artifactId } : null),
    [artifactId, projectId]
  );
  const artifactKey = useMemo(
    () => (artifactId ? getTerminalArtifactKey(projectId, artifactId) : null),
    [artifactId, projectId]
  );
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const toggleDock = useTerminalStore((state) => state.toggleDock);
  const terminalDockOpen = useTerminalStore((state) =>
    artifactKey ? (state.dockByArtifact[artifactKey]?.open ?? false) : false
  );
  const isArtifactsView = Boolean(artifactId && pathname.endsWith('/artifacts'));

  return (
    <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-3 px-3">
      <HeaderBreadcrumb />

      {/* Right — Actions + Theme toggle */}
      <div className="flex shrink-0 items-center gap-1">
        {artifactId && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push(`/${projectId}/${artifactId}/artifacts`)}
            className={cn(
              'cursor-pointer',
              isArtifactsView ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label="Open artifacts"
            title="Artifacts"
          >
            <FolderOpen size={16} strokeWidth={1.8} />
          </Button>
        )}
        {artifactCtx ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void toggleDock(artifactCtx).catch(() => undefined);
            }}
            className={cn(
              'cursor-pointer',
              terminalDockOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label="Toggle terminal"
            title="Toggle terminal (Ctrl+`)"
          >
            <TerminalIcon size={16} strokeWidth={1.8} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleTheme}
          className="cursor-pointer text-muted-foreground hover:text-foreground"
        >
          {theme === 'light' ? (
            <Moon size={18} strokeWidth={1.8} />
          ) : (
            <Sun size={18} strokeWidth={1.8} />
          )}
        </Button>
      </div>
    </header>
  );
}
