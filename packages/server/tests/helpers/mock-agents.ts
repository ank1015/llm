import { join } from 'node:path';

import { vi } from 'vitest';

function createSetupSkillsResult(projectDir: string) {
  const rootDir = join(projectDir, 'max-skills');

  return {
    rootDir,
    skillsDir: join(rootDir, 'skills'),
    scriptsDir: join(rootDir, 'scripts'),
    installedPackages: {},
    registryPath: join(rootDir, 'skills', 'registry.json'),
    skillsRegistry: [],
  };
}

export const mockSetupSkills = vi.fn(async (projectDir: string) =>
  createSetupSkillsResult(projectDir)
);
export const mockCreateSystemPrompt = vi.fn(async () => 'test-system-prompt');
export const mockCreateAllTools = vi.fn(() => ({}));

export function resetAgentMocks(): void {
  mockSetupSkills.mockReset();
  mockSetupSkills.mockImplementation(async (projectDir: string) =>
    createSetupSkillsResult(projectDir)
  );

  mockCreateSystemPrompt.mockReset();
  mockCreateSystemPrompt.mockResolvedValue('test-system-prompt');

  mockCreateAllTools.mockReset();
  mockCreateAllTools.mockReturnValue({});
}

vi.mock('@ank1015/llm-agents', () => ({
  createAllTools: mockCreateAllTools,
  createSystemPrompt: mockCreateSystemPrompt,
  setUpSkills: mockSetupSkills,
  setupSkills: mockSetupSkills,
}));
