import type { MockBranch, MockProject, MockThread } from '@/lib/mock-data';

import { findBranchBySlug, MOCK_PROJECTS } from '@/lib/mock-data';

function delay(ms = 80): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getProjects(): Promise<MockProject[]> {
  await delay();
  return MOCK_PROJECTS;
}

export async function getProjectByName(name: string): Promise<MockProject | undefined> {
  await delay();
  return MOCK_PROJECTS.find((p) => p.projectName === name);
}

export async function getBranchBySlug(
  projectName: string,
  slug: string
): Promise<MockBranch | undefined> {
  await delay();
  const project = MOCK_PROJECTS.find((p) => p.projectName === projectName);
  if (!project) return undefined;
  return findBranchBySlug(project, slug);
}

export async function getThreadMessages(
  projectName: string,
  branchSlug: string,
  threadId: string
): Promise<MockThread | undefined> {
  await delay();
  const project = MOCK_PROJECTS.find((p) => p.projectName === projectName);
  if (!project) return undefined;
  const branch = findBranchBySlug(project, branchSlug);
  if (!branch) return undefined;
  return branch.threads.find((t) => t.threadId === threadId);
}
