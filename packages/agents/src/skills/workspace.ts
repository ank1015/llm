import { join, resolve } from 'node:path';

export const MAX_DIR_NAME = '.max';
export const INSTALLED_SKILLS_DIR_NAME = 'skills';
export const TEMP_DIR_NAME = 'temp';

export interface SkillWorkspaceLayout {
  rootDir: string;
  stateDir: string;
  skillsDir: string;
  tempDir: string;
}

export function createArtifactSkillWorkspaceLayout(artifactDir: string): SkillWorkspaceLayout {
  const rootDir = resolve(artifactDir);
  const stateDir = join(rootDir, MAX_DIR_NAME);

  return {
    rootDir,
    stateDir,
    skillsDir: join(stateDir, INSTALLED_SKILLS_DIR_NAME),
    tempDir: join(stateDir, TEMP_DIR_NAME),
  };
}
