'use client';

import { use } from 'react';

import { findBranchBySlug, MOCK_PROJECTS } from '@/lib/mock-data';

export default function ThreadPage({
  params,
}: {
  params: Promise<{ project: string; branch: string; threadId: string }>;
}): React.ReactElement {
  const { project: projectName, branch: branchSlug, threadId } = use(params);

  const project = MOCK_PROJECTS.find((p) => p.projectName === projectName);
  const branch = project ? findBranchBySlug(project, branchSlug) : undefined;
  const thread = branch?.threads.find((t) => t.threadId === threadId);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      {thread ? (
        <>
          <p className="text-foreground text-sm font-medium">{thread.threadName}</p>
          <p className="text-muted-foreground text-xs">
            {projectName} / {branch?.branchName}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Thread not found</p>
      )}
      <p className="text-muted-foreground mt-4 text-xs">No content yet</p>
    </div>
  );
}
