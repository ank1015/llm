'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { useProjectOverview } from '@/hooks/use-project-overview';

function HeaderBreadcrumb() {
  const pathname = usePathname();
  const segments = useMemo(() => pathname.split('/').filter(Boolean), [pathname]);

  if (segments.length === 0) return null;

  const projectId = segments[0]!;
  const artifactId = segments[1];
  const sessionId = segments[2];

  const lastSegment = sessionId ? 'session' : artifactId ? 'artifact' : 'project';

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
        {decodeURIComponent(projectId)}
      </Link>
      {artifactId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <Link
            href={`/${projectId}/${artifactId}`}
            className={linkClass(lastSegment === 'artifact')}
          >
            {decodeURIComponent(artifactId)}
          </Link>
        </>
      )}
      {sessionId && (
        <>
          <ChevronRight size={14} className="text-muted-foreground" />
          <span className={linkClass(true)}>{sessionId}</span>
        </>
      )}
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const projectId = useMemo(() => pathname.split('/').filter(Boolean)[0] ?? '', [pathname]);

  // Fetch overview data — populates artifact dirs + sessions stores
  useProjectOverview(projectId);

  return (
    <div className="bg-home-page flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 w-full shrink-0 items-center justify-between px-3">
          <HeaderBreadcrumb />
          <ThemeToggle />
        </header>
        <main className="relative flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
