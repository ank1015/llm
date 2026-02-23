'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import type { MockBranchDiff } from '@/lib/mock-diff-data';

import { DiffFileTree } from '@/components/diff/diff-file-tree';
import { DiffViewer } from '@/components/diff/diff-viewer';
import { getDiffForThread } from '@/lib/client-api';
import { findBranchBySlug } from '@/lib/mock-data';
import { useProjectsStore, useUiStore } from '@/stores';

export default function ThreadDiffPage({
  params,
}: {
  params: Promise<{ project: string; branch: string; threadId: string }>;
}): React.ReactElement {
  const { project: projectName, branch: branchSlug, threadId } = use(params);
  const projects = useProjectsStore((s) => s.projects);
  const fetchProjects = useProjectsStore((s) => s.fetchProjects);

  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const wasCollapsedRef = useRef(useUiStore.getState().isSidebarCollapsed);

  const [diff, setDiff] = useState<MockBranchDiff | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  // Auto-collapse sidebar on mount, restore on unmount
  useEffect(() => {
    const wasCollapsed = wasCollapsedRef.current;
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(wasCollapsed);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    void getDiffForThread(projectName, branchSlug, threadId).then((data) => {
      setDiff(data);
      if (data.files.length > 0) {
        setSelectedFilePath(data.files[0]!.filePath);
      }
    });
  }, [projectName, branchSlug, threadId]);

  const project = projects.find((p) => p.projectName === projectName);
  const branch = project ? findBranchBySlug(project, branchSlug) : undefined;
  const thread = branch?.threads.find((t) => t.threadId === threadId);

  const handleSelectFile = useCallback((filePath: string) => {
    setSelectedFilePath(filePath);
  }, []);

  if (!thread) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Thread not found</p>
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
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize="20%" minSize="12%" maxSize="40%">
        <DiffFileTree
          files={diff.files}
          selectedFilePath={selectedFilePath}
          onSelectFile={handleSelectFile}
        />
      </Panel>
      <Separator className="bg-home-border hover:bg-primary/30 data-[separator=active]:bg-primary/50 w-[1px] transition-colors" />
      <Panel minSize="40%">
        <DiffViewer file={selectedFile} />
      </Panel>
    </Group>
  );
}
