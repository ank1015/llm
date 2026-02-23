'use client';

import { ChevronRight, FileDiff, GitBranch, GitMerge } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const isLast = (index: number) => index === Math.min(segments.length - 1, 1);

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
        Projects
      </Link>
      <ChevronRight size={14} className="text-muted-foreground" />
      <Link
        href={`/${projectName}`}
        className={
          isLast(0)
            ? 'text-foreground font-medium hover:text-foreground/80 transition-colors'
            : 'text-muted-foreground hover:text-foreground transition-colors'
        }
      >
        {projectName}
      </Link>
      {branchSlug && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectName}/${branchSlug}`}
            className="text-foreground font-medium hover:text-foreground/80 transition-colors"
          >
            {branchSlug}
          </Link>
        </>
      )}
    </div>
  );
}

function HeaderActions() {
  const pathname = usePathname();
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

  // /{project}/{branch} — show View Diff + Merge Branch (if active)
  if (segments.length === 2 && projectName && branchSlug) {
    const project = projects.find((p) => p.projectName === projectName);
    const branch = project ? findBranchBySlug(project, branchSlug) : undefined;
    const isActive = branch?.status === 'active';

    return (
      <>
        <Button variant="outline" size="sm">
          <FileDiff size={14} />
          View Diff
        </Button>
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
