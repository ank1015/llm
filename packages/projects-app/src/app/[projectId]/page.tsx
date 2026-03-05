'use client';

import { Folder, Loader2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { ArtifactDirWithSessions } from '@/lib/client-api';

import { Button } from '@/components/ui/button';
import { getProjectOverview } from '@/lib/client-api';
import { useSidebarStore } from '@/stores';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [artifactDirs, setArtifactDirs] = useState<ArtifactDirWithSessions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sidebarArtifactDirs = useSidebarStore((state) => state.artifactDirs);
  const router = useRouter();

  useEffect(() => {
    if (!projectId) return;
    void loadArtifacts();
  }, [projectId]);

  useEffect(() => {
    setArtifactDirs(sidebarArtifactDirs);
  }, [sidebarArtifactDirs]);

  const loadArtifacts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const overview = await getProjectOverview(projectId);
      setArtifactDirs(overview.artifactDirs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-8 py-6">
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-muted-foreground animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" className="cursor-pointer" onClick={() => void loadArtifacts()}>
            Retry
          </Button>
        </div>
      ) : artifactDirs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Folder size={40} className="text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            No artifacts yet. Create one from the sidebar.
          </p>
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artifactDirs.map((dir) => (
            <button
              key={dir.id}
              onClick={() => router.push(`/${projectId}/${dir.id}`)}
              className="bg-home-panel border-home-border hover:bg-home-hover flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-5 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <Folder size={16} className="text-muted-foreground" />
                <span className="text-foreground text-sm font-medium">{dir.name}</span>
              </div>
              {dir.description && (
                <span className="text-muted-foreground text-xs line-clamp-2">
                  {dir.description}
                </span>
              )}
              <span className="text-muted-foreground mt-1 text-[11px]">
                {dir.sessions.length} {dir.sessions.length === 1 ? 'thread' : 'threads'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
