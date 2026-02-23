'use client';

import { GitBranch, GitCommitHorizontal, SquarePen } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect } from 'react';

import { ThreadInput } from '@/components/thread-input';
import { Button } from '@/components/ui/button';
import { branchToSlug, findBranchBySlug } from '@/lib/mock-data';
import { useProjectsStore } from '@/stores';

export default function BranchPage({
  params,
}: {
  params: Promise<{ project: string; branch: string }>;
}): React.ReactElement {
  const { project: projectName, branch: branchSlug } = use(params);
  const projects = useProjectsStore((s) => s.projects);
  const fetchProjects = useProjectsStore((s) => s.fetchProjects);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const project = projects.find((p) => p.projectName === projectName);
  const branch = project ? findBranchBySlug(project, branchSlug) : undefined;

  if (!branch) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Branch not found</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-8 pt-6">
        <div className="mx-auto w-full max-w-3xl pb-[200px]">
          <div className="flex items-center gap-2 mt-10 mb-6">
            <GitBranch size={18} className="text-muted-foreground" />
            <h1 className="text-foreground text-lg font-medium">{branch.branchName}</h1>
            <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
              {branch.status}
            </span>
            <div className="flex-1" />
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <GitCommitHorizontal size={14} />
              {branch.threads.length}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <SquarePen size={16} />
            </Button>
          </div>

          {branch.threads.length > 0 && (
            <div className="flex flex-col gap-1 mb-14">
              {branch.threads.map((thread) => (
                <Link
                  key={thread.threadId}
                  href={`/${projectName}/${branchToSlug(branch.branchName)}/${thread.threadId}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-home-hover transition-colors"
                >
                  <span className="text-foreground text-sm">{thread.threadName}</span>
                  <span className="text-muted-foreground text-xs">{thread.age}</span>
                </Link>
              ))}
            </div>
          )}

          {branch.description && (
            <div className="flex flex-col items-start gap-1">
              <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                Info
              </h2>
              <div className="text-foreground max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed">
                {branch.description}
              </div>
            </div>
          )}
        </div>
      </div>
      <ThreadInput />
    </div>
  );
}
