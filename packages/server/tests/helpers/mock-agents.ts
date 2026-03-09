import { join } from 'node:path';

import { vi } from 'vitest';

function getSkillDescription(skillName: string): string {
  switch (skillName) {
    case 'browser-use':
      return 'Browser automation and site-specific helpers.';
    case 'llm-use':
      return 'LLM SDK workflows and scripts.';
    case 'pptx':
      return 'PowerPoint deck creation and editing helpers.';
    case 'xlsx':
      return 'Spreadsheet automation and validation helpers.';
    default:
      return `${skillName} description`;
  }
}

function createBundledSkillResult(skillName: string) {
  return {
    name: skillName,
    description: getSkillDescription(skillName),
    directory: join('/mock/skills', skillName),
    path: join('/mock/skills', skillName, 'SKILL.md'),
  };
}

function createInstalledSkillResult(skillName: string, artifactDir: string) {
  const maxDir = join(artifactDir, '.max');
  const skillsDir = join(maxDir, 'skills');
  const tempDir = join(maxDir, 'temp');
  const directory = join(skillsDir, skillName);
  const bundled = createBundledSkillResult(skillName);

  return {
    directory,
    path: join(directory, 'SKILL.md'),
    name: bundled.name,
    description: bundled.description,
    artifactDir,
    maxDir,
    skillsDir,
    tempDir,
    sourceDirectory: bundled.directory,
    sourcePath: bundled.path,
  };
}

function createDeletedSkillResult(skillName: string, artifactDir: string) {
  return {
    ...createInstalledSkillResult(skillName, artifactDir),
    deleted: true as const,
  };
}

export const mockListBundledSkills = vi.fn(async () => [
  createBundledSkillResult('browser-use'),
  createBundledSkillResult('llm-use'),
  createBundledSkillResult('pptx'),
  createBundledSkillResult('xlsx'),
]);
export const mockListInstalledSkills = vi.fn(async () => []);
export const mockAddSkill = vi.fn(async (skillName: string, artifactDir: string) =>
  createInstalledSkillResult(skillName, artifactDir)
);
export const mockDeleteSkill = vi.fn(async (skillName: string, artifactDir: string) =>
  createDeletedSkillResult(skillName, artifactDir)
);
export const mockCreateSystemPrompt = vi.fn(async () => 'test-system-prompt');
export const mockCreateAllTools = vi.fn(() => ({}));

export function resetAgentMocks(): void {
  mockListBundledSkills.mockReset();
  mockListBundledSkills.mockImplementation(async () => [
    createBundledSkillResult('browser-use'),
    createBundledSkillResult('llm-use'),
    createBundledSkillResult('pptx'),
    createBundledSkillResult('xlsx'),
  ]);

  mockListInstalledSkills.mockReset();
  mockListInstalledSkills.mockResolvedValue([]);

  mockAddSkill.mockReset();
  mockAddSkill.mockImplementation(async (skillName: string, artifactDir: string) =>
    createInstalledSkillResult(skillName, artifactDir)
  );

  mockDeleteSkill.mockReset();
  mockDeleteSkill.mockImplementation(async (skillName: string, artifactDir: string) =>
    createDeletedSkillResult(skillName, artifactDir)
  );

  mockCreateSystemPrompt.mockReset();
  mockCreateSystemPrompt.mockResolvedValue('test-system-prompt');

  mockCreateAllTools.mockReset();
  mockCreateAllTools.mockReturnValue({});
}

vi.mock('@ank1015/llm-agents', () => ({
  addSkill: mockAddSkill,
  createAllTools: mockCreateAllTools,
  createSystemPrompt: mockCreateSystemPrompt,
  deleteSkill: mockDeleteSkill,
  listBundledSkills: mockListBundledSkills,
  listInstalledSkills: mockListInstalledSkills,
}));
