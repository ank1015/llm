'use client';

import { Folder, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ArtifactSkillsPanel } from '@/components/artifact-skills-panel';
import { useSidebarStore } from '@/stores';

export default function ArtifactPage() {
  const { projectId, artifactId } = useParams<{ projectId: string; artifactId: string }>();
  const isLoading = useSidebarStore((state) => state.isLoading);
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((dir) => dir.id === artifactId) ?? null
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!artifact) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Artifact not found</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-8 pt-6">
      <div className="mx-auto w-full max-w-3xl pb-[200px]">
        {/* Header */}
        <div className="mt-10 mb-6 flex items-center gap-2">
          <Folder size={18} className="text-muted-foreground" />
          <h1 className="text-foreground text-lg font-medium">{artifact.name}</h1>
          <div className="flex-1" />
          <ArtifactSkillsPanel projectId={projectId} artifactId={artifactId} />
        </div>

        {/* Thread list */}
        {artifact.sessions.length > 0 && (
          <div className="mb-14 flex flex-col gap-1">
            {artifact.sessions.map((session) => (
              <Link
                key={session.sessionId}
                href={`/${projectId}/${artifactId}/${session.sessionId}`}
                className="hover:bg-home-hover flex items-center justify-between rounded-lg px-3 py-2 transition-colors"
              >
                <span className="text-foreground text-sm">{session.sessionName}</span>
                <span className="text-muted-foreground text-xs">
                  {new Date(session.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Description */}
        {artifact.description && (
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
              Info
            </h2>
            <div className="text-foreground max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed">
              {artifact.description}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
