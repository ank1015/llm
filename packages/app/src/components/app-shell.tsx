'use client';

import { ChevronRight, FileDiff, GitBranch, GitMerge } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { NewBranchDialog } from '@/components/new-branch-dialog';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { findBranchBySlug } from '@/lib/mock-data';
import { useProjectsStore } from '@/stores';

function HeaderBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const projectName = segments[0]!;
  const branchSlug = segments[1];
  const isBranchDiff = segments[2] === 'diff';
  const threadId = !isBranchDiff ? segments[2] : undefined;
  const isThreadDiff = threadId !== undefined && segments[3] === 'diff';

  // Determine last segment for styling the "active" breadcrumb
  const lastSegment = isThreadDiff
    ? 'threadDiff'
    : threadId
      ? 'thread'
      : isBranchDiff
        ? 'branchDiff'
        : branchSlug
          ? 'branch'
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
      <Link href={`/${projectName}`} className={linkClass(lastSegment === 'project')}>
        {projectName}
      </Link>
      {branchSlug && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectName}/${branchSlug}`}
            className={linkClass(lastSegment === 'branch')}
          >
            {branchSlug}
          </Link>
        </>
      )}
      {threadId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectName}/${branchSlug}/${threadId}`}
            className={linkClass(lastSegment === 'thread')}
          >
            {threadId}
          </Link>
        </>
      )}
      {(isBranchDiff || isThreadDiff) && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <span className="text-foreground font-medium">diff</span>
        </>
      )}
    </div>
  );
}

function HeaderActions() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname.split('/').filter(Boolean);
  const projects = useProjectsStore((s) => s.projects);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);

  const projectName = segments[0];
  const branchSlug = segments[1];

  // /{project} — show Create Branch
  if (segments.length === 1 && projectName) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setIsBranchDialogOpen(true)}>
          <GitBranch size={14} />
          Create Branch
        </Button>
        <NewBranchDialog
          open={isBranchDialogOpen}
          onOpenChange={setIsBranchDialogOpen}
          projectName={projectName}
        />
      </>
    );
  }

  // /{project}/{branch}... — show actions
  if (segments.length >= 2 && projectName && branchSlug) {
    const project = projects.find((p) => p.projectName === projectName);
    const branch = project ? findBranchBySlug(project, branchSlug) : undefined;
    const isActive = branch?.status === 'active';

    const isBranchDiff = segments[2] === 'diff';
    const threadId = !isBranchDiff ? segments[2] : undefined;
    const isThreadDiff = threadId !== undefined && segments[3] === 'diff';
    const isDiffPage = isBranchDiff || isThreadDiff;

    // Determine diff navigation target
    const diffHref = threadId
      ? `/${projectName}/${branchSlug}/${threadId}/diff`
      : `/${projectName}/${branchSlug}/diff`;

    return (
      <>
        {!isDiffPage && (
          <Button variant="outline" size="sm" onClick={() => router.push(diffHref)}>
            <FileDiff size={14} />
            View Diff
          </Button>
        )}
        {isActive && (
          <Button variant="outline" size="sm">
            <GitMerge size={14} />
            Merge Branch
          </Button>
        )}
      </>
    );
  }

  return null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-home-page flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 w-full shrink-0 items-center justify-between px-3">
          <HeaderBreadcrumb />
          <div className="flex items-center gap-4">
            <HeaderActions />
            <ThemeToggle />
          </div>
        </header>
        <main className="relative flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
