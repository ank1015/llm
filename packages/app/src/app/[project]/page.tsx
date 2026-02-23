'use client';

import { use, useEffect } from 'react';

import { GitGraph } from '@/components/git-graph';
import { useProjectsStore } from '@/stores';

export default function ProjectPage({
  params,
}: {
  params: Promise<{ project: string }>;
}): React.ReactElement {
  const { project: projectName } = use(params);
  const projects = useProjectsStore((s) => s.projects);
  const fetchProjects = useProjectsStore((s) => s.fetchProjects);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const project = projects.find((p) => p.projectName === projectName);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Project not found</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4">
      <GitGraph project={project} />
    </div>
  );
}
