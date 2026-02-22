'use client';

import { use } from 'react';

import { GitGraph } from '@/components/git-graph';
import { MOCK_PROJECTS } from '@/lib/mock-data';

export default function ProjectPage({
  params,
}: {
  params: Promise<{ project: string }>;
}): React.ReactElement {
  const { project: projectName } = use(params);
  const project = MOCK_PROJECTS.find((p) => p.projectName === projectName);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Project not found</p>
      </div>
    );
  }

  return <GitGraph project={project} />;
}
