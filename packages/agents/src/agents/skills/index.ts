import { mkdir, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  addSkillToLayout,
  createArtifactSkillWorkspaceLayout,
  listBundledSkills,
  listInstalledSkillsInLayout,
  readBundledSkillMetadata,
  type BundledSkillEntry,
  type SkillHelperProjectConfig,
  type SkillRegistryEntry,
  type WorkspaceAddSkillResult,
  type WorkspaceInstalledSkillEntry,
  deleteSkillFromLayout,
  INSTALLED_SKILLS_DIR_NAME,
  MAX_DIR_NAME,
  SKILL_TESTER_DIR_NAME,
  TEMP_DIR_NAME,
} from './runtime.js';

export {
  INSTALLED_SKILLS_DIR_NAME,
  MAX_DIR_NAME,
  SKILL_TESTER_DIR_NAME,
  TEMP_DIR_NAME,
  listBundledSkills,
  readBundledSkillMetadata,
  type BundledSkillEntry,
  type SkillHelperProjectConfig,
  type SkillRegistryEntry,
};

export interface InstalledSkillEntry extends SkillRegistryEntry {
  artifactDir: string;
  maxDir: string;
  skillsDir: string;
  tempDir: string;
  directory: string;
  helperProject?: SkillHelperProjectConfig;
}

export interface AddSkillResult extends InstalledSkillEntry {
  sourceDirectory: string;
  sourcePath: string;
}

export interface DeleteSkillResult extends InstalledSkillEntry {
  deleted: true;
}

export async function addSkill(skillName: string, artifactDir: string): Promise<AddSkillResult> {
  await mkdir(artifactDir, { recursive: true });
  const resolvedArtifactDir = await realpath(artifactDir);
  const layout = createArtifactSkillWorkspaceLayout(resolvedArtifactDir);
  const installedSkill = await addSkillToLayout(skillName, layout);
  return toPublicAddSkillResult(layout.rootDir, layout.stateDir, installedSkill);
}

export async function deleteSkill(
  skillName: string,
  artifactDir: string
): Promise<DeleteSkillResult> {
  const resolvedArtifactDir = resolve(artifactDir);
  const layout = createArtifactSkillWorkspaceLayout(resolvedArtifactDir);
  const installedSkill = await deleteSkillFromLayout(skillName, layout).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('not found in workspace')) {
      throw new Error(`Installed skill "${skillName}" not found in artifact`);
    }
    throw error;
  });

  return {
    ...toPublicInstalledSkill(layout.rootDir, layout.stateDir, installedSkill),
    deleted: true,
  };
}

export async function listInstalledSkills(artifactDir: string): Promise<InstalledSkillEntry[]> {
  const resolvedArtifactDir = resolve(artifactDir);
  const layout = createArtifactSkillWorkspaceLayout(resolvedArtifactDir);
  const installedSkills = await listInstalledSkillsInLayout(layout);
  return installedSkills.map((skill) =>
    toPublicInstalledSkill(layout.rootDir, layout.stateDir, skill)
  );
}

function toPublicInstalledSkill(
  artifactDir: string,
  maxDir: string,
  skill: WorkspaceInstalledSkillEntry
): InstalledSkillEntry {
  return {
    name: skill.name,
    description: skill.description,
    path: skill.path,
    artifactDir,
    maxDir,
    skillsDir: skill.skillsDir,
    tempDir: skill.tempDir,
    directory: skill.directory,
    ...(skill.helperProject ? { helperProject: skill.helperProject } : {}),
  };
}

function toPublicAddSkillResult(
  artifactDir: string,
  maxDir: string,
  skill: WorkspaceAddSkillResult
): AddSkillResult {
  return {
    ...toPublicInstalledSkill(artifactDir, maxDir, skill),
    sourceDirectory: skill.sourceDirectory,
    sourcePath: skill.sourcePath,
  };
}
