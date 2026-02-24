'use client';

import { Folder, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCreateProject, useProjects } from '@/hooks/use-projects';
import { useProjectsStore } from '@/stores/projects-store';

function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const createProject = useCreateProject();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    createProject.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setName('');
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex w-24 cursor-pointer flex-col items-center gap-1.5 rounded-lg p-3 transition-colors hover:bg-home-hover">
          <div className="flex h-12 w-12 items-center justify-center">
            <Plus size={32} strokeWidth={1.2} className="text-muted-foreground" />
          </div>
          <span className="w-full truncate text-center text-xs text-muted-foreground">
            Create project
          </span>
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>Enter a name for your new project.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-home-input border-home-border h-10 w-full rounded-lg border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="cursor-pointer"
              disabled={!name.trim() || createProject.isPending}
            >
              {createProject.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
          {createProject.isError && (
            <p className="text-xs text-red-500">{createProject.error.message}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function HomePage(): React.ReactElement {
  const { isLoading, isError } = useProjects();
  const projects = useProjectsStore((s) => s.projects);

  return (
    <div className="bg-home-page flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex h-12 w-full shrink-0 items-center justify-end px-4">
        <ThemeToggle />
      </header>
      <main className="relative flex-1 overflow-hidden p-6">
        <h1 className="mb-6 text-lg font-semibold text-foreground">Projects</h1>

        {isLoading && <p className="text-sm text-muted-foreground">Loading projects...</p>}

        {isError && <p className="text-sm text-red-500">Failed to load projects.</p>}

        {!isLoading && (
          <div className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/${project.id}`}
                className="flex w-24 flex-col items-center gap-1.5 rounded-lg p-3 transition-colors hover:bg-home-hover"
              >
                <Folder size={48} strokeWidth={1.2} className="text-muted-foreground" />
                <span className="w-full truncate text-center text-xs text-foreground">
                  {project.name}
                </span>
              </Link>
            ))}
            <CreateProjectDialog />
          </div>
        )}
      </main>
    </div>
  );
}
