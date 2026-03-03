'use client';

import { ChevronRight, FolderOpen, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ProjectOverview } from '@/lib/client-api';

import { Button } from '@/components/ui/button';
import { getProjectOverview } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

function HeaderBreadcrumb() {
  const { projectId, artifactId, threadId } = useParams<{
    projectId: string;
    artifactId?: string;
    threadId?: string;
  }>();
  const pathname = usePathname();

  const [overview, setOverview] = useState<ProjectOverview | null>(null);

  useEffect(() => {
    if (!projectId) return;
    void getProjectOverview(projectId)
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [projectId]);

  const projectName = overview?.project.name ?? projectId;
  const artifact = artifactId ? overview?.artifactDirs.find((d) => d.id === artifactId) : undefined;
  const artifactName = artifact?.name ?? artifactId;

  // Get thread name from the overview data
  const session =
    threadId && artifact ? artifact.sessions.find((s) => s.sessionId === threadId) : undefined;
  const threadName = session?.sessionName ?? threadId;
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
    active
      ? 'text-foreground font-medium hover:text-foreground/80 transition-colors'
      : 'text-muted-foreground hover:text-foreground transition-colors';

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
        Projects
      </Link>
      <ChevronRight size={14} className="text-muted-foreground" />
      <Link href={`/${projectId}`} className={linkClass(lastSegment === 'project')}>
        {projectName}
      </Link>
      {artifactId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectId}/${artifactId}`}
            className={linkClass(lastSegment === 'artifact')}
          >
            {artifactName}
          </Link>
        </>
      )}
      {threadId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectId}/${artifactId}/${threadId}`}
            className={linkClass(lastSegment === 'thread')}
          >
            {threadName}
          </Link>
        </>
      )}
      {isArtifactsView && artifactId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectId}/${artifactId}/artifacts`}
            className={linkClass(lastSegment === 'artifacts')}
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
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const isArtifactsView = Boolean(artifactId && pathname.endsWith('/artifacts'));

  return (
    <header className="flex h-12 w-full shrink-0 items-center justify-between px-3">
      <HeaderBreadcrumb />

      {/* Right — Actions + Theme toggle */}
      <div className="flex items-center gap-1">
        {artifactId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${projectId}/${artifactId}/artifacts`)}
            className={cn(
              'cursor-pointer gap-1.5',
              isArtifactsView ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FolderOpen size={16} strokeWidth={1.8} />
            <span className="text-[13px]">Artifacts</span>
          </Button>
        )}
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
