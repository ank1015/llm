'use client';

import { Folder, MessageSquare, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

import { Button } from '@/components/ui/button';
import { mockArtifacts } from '@/lib/mock-data';

export default function ArtifactPage({
  params,
}: {
  params: Promise<{ projectName: string; artifactName: string }>;
}): React.ReactElement {
  const { projectName, artifactName } = use(params);
  const artifact = mockArtifacts.find((a) => a.name === artifactName);

  if (!artifact) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Artifact not found</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 pt-6">
        <div className="mx-auto w-full max-w-3xl pb-[200px]">
          <div className="mb-6 mt-10 flex items-center gap-2">
            <Folder size={18} className="text-muted-foreground" />
            <h1 className="text-lg font-medium text-foreground">{artifact.name}</h1>
            <div className="flex-1" />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare size={14} />
              {artifact.threads.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <SquarePen size={16} />
            </Button>
          </div>

          {artifact.threads.length > 0 && (
            <div className="mb-14 flex flex-col gap-1">
              {artifact.threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/${projectName}/${artifactName}/${thread.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-home-hover"
                >
                  <span className="text-sm text-foreground">{thread.name}</span>
                  <span className="text-xs text-muted-foreground">{thread.age}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
