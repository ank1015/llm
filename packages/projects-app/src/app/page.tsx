import { Folder } from 'lucide-react';
import Link from 'next/link';

import { ThemeToggle } from '@/components/theme-toggle';
import { mockProjects } from '@/lib/mock-data';

export default function HomePage(): React.ReactElement {
  return (
    <div className="bg-home-page flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex h-12 w-full shrink-0 items-center justify-end px-4">
        <ThemeToggle />
      </header>
      <main className="relative flex-1 overflow-hidden p-6">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Projects</h1>
        <div className="flex flex-wrap gap-2">
          {mockProjects.map((project) => (
            <Link
              key={project.id}
              href={`/${project.name}`}
              className="flex w-24 flex-col items-center gap-1.5 rounded-lg p-3 transition-colors hover:bg-home-hover"
            >
              <Folder size={48} strokeWidth={1.2} className="text-muted-foreground" />
              <span className="w-full truncate text-center text-xs text-foreground">
                {project.name}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
