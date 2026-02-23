'use client';

import { use, useCallback, useEffect, useState } from 'react';

import type { MockBranchDiff } from '@/lib/mock-diff-data';

import { DiffFileTree } from '@/components/diff/diff-file-tree';
import { DiffViewer } from '@/components/diff/diff-viewer';
import { getDiffForBranch } from '@/lib/client-api';
import { findBranchBySlug } from '@/lib/mock-data';
import { useProjectsStore } from '@/stores';

export default function DiffPage({
  params,
}: {
  params: Promise<{ project: string; branch: string }>;
}): React.ReactElement {
  const { project: projectName, branch: branchSlug } = use(params);
  const projects = useProjectsStore((s) => s.projects);
  const fetchProjects = useProjectsStore((s) => s.fetchProjects);

  const [diff, setDiff] = useState<MockBranchDiff | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    void getDiffForBranch(projectName, branchSlug).then((data) => {
      setDiff(data);
      if (data.files.length > 0) {
        setSelectedFilePath(data.files[0]!.filePath);
      }
    });
  }, [projectName, branchSlug]);

  const project = projects.find((p) => p.projectName === projectName);
  const branch = project ? findBranchBySlug(project, branchSlug) : undefined;

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedFilePath(filePath);
  }, []);

  if (!branch) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Branch not found</p>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading diff...</p>
      </div>
    );
  }

  const selectedFile = diff.files.find((f) => f.filePath === selectedFilePath) ?? null;

  return (
    <div className="flex h-full">
      <DiffFileTree
        files={diff.files}
        selectedFilePath={selectedFilePath}
        onSelectFile={handleSelectFile}
      />
      <div className="flex-1 overflow-hidden">
        <DiffViewer file={selectedFile} />
      </div>
    </div>
  );
}
