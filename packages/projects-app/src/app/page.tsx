'use client';

import { Ellipsis, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { ProjectMetadata } from '@/lib/client-api';
import type { FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createProject, deleteProject, listProjects } from '@/lib/client-api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectClick = (project: ProjectMetadata) => {
    router.push(`/${project.id}`);
  };

  const handleProjectCreated = (project: ProjectMetadata) => {
    setProjects((prev) => [project, ...prev]);
    setIsCreateOpen(false);
    router.push(`/${project.id}`);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (deletingProjectId) return;

    setDeletingProjectId(projectId);
    setError(null);
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((project) => project.id !== projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="bg-home-page flex h-dvh w-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-home-border px-8 py-4">
        <h1 className="text-foreground text-xl font-semibold">Projects</h1>
        <Button className="cursor-pointer gap-2" onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} />
          Create Project
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="text-muted-foreground animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <p className="text-sm text-red-500">{error}</p>
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => void loadProjects()}
            >
              Retry
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <FolderOpen size={40} className="text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              No projects yet. Create one to get started.
            </p>
            <Button className="cursor-pointer gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus size={16} />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-home-panel border-home-border hover:bg-home-hover relative flex rounded-xl border p-5 transition-colors"
              >
                <button
                  onClick={() => handleProjectClick(project)}
                  className="flex flex-1 cursor-pointer flex-col items-start gap-1 pr-8 text-left"
                >
                  <span className="text-foreground text-sm font-medium">{project.name}</span>
                  {project.description && (
                    <span className="text-muted-foreground text-xs line-clamp-2">
                      {project.description}
                    </span>
                  )}
                  <span className="text-muted-foreground mt-1 text-[11px]">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="absolute top-3 right-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      aria-label={`Project actions for ${project.name}`}
                    >
                      <Ellipsis size={14} strokeWidth={1.8} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[150px]">
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={deletingProjectId === project.id}
                      onClick={() => void handleDeleteProject(project.id)}
                    >
                      {deletingProjectId === project.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: ProjectMetadata) => void;
}) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const project = await createProject({ name: trimmed });
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-home-page border-home-border sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-base">Create project</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Give your project a name to get started.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-home-panel border-home-border text-foreground placeholder:text-muted-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-foreground/20"
            placeholder="Project name"
          />
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" className="cursor-pointer" disabled={!name.trim() || isCreating}>
              {isCreating ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
