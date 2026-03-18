import { spawn } from 'node:child_process';

import {
  addSkillToLayout,
  createSkillTesterWorkspaceLayout,
  getAgentsMonorepoRoot,
  getAgentsPackageRoot,
  listInstalledSkillsInLayout,
  pruneInstalledSkillsInLayout,
  readBundledSkillMetadata,
  type SkillWorkspaceLayout,
  type WorkspaceAddSkillResult,
  type WorkspaceInstalledSkillEntry,
} from './runtime.js';

let skillTesterBuildPromise: Promise<void> | undefined;

export interface PrepareSkillTesterWorkspaceOptions {
  workspaceRoot?: string;
  buildPackages?: () => Promise<void>;
}

export interface PreparedSkillTesterWorkspace {
  skillName: string;
  layout: SkillWorkspaceLayout;
  packageRoot: string;
  monorepoRoot: string;
  installedSkill: WorkspaceAddSkillResult;
  installedSkills: WorkspaceInstalledSkillEntry[];
}

export async function runSkillTesterBuild(): Promise<void> {
  if (skillTesterBuildPromise) {
    return skillTesterBuildPromise;
  }

  const monorepoRoot = getAgentsMonorepoRoot();
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  skillTesterBuildPromise = new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(pnpmCommand, ['build:packages'], {
      cwd: monorepoRoot,
      stdio: 'inherit',
    });

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Local package build failed with exit code ${code ?? 'unknown'}`));
    });
  });

  try {
    await skillTesterBuildPromise;
  } catch (error) {
    skillTesterBuildPromise = undefined;
    throw error;
  }
}

export async function prepareSkillTesterWorkspace(
  skillName: string,
  options: PrepareSkillTesterWorkspaceOptions = {}
): Promise<PreparedSkillTesterWorkspace> {
  await readBundledSkillMetadata(skillName);

  const buildPackages = options.buildPackages ?? runSkillTesterBuild;
  await buildPackages();

  const layout = createSkillTesterWorkspaceLayout(options.workspaceRoot);
  await pruneInstalledSkillsInLayout(layout, [skillName]);
  const installedSkill = await addSkillToLayout(skillName, layout);
  const installedSkills = await listInstalledSkillsInLayout(layout);

  return {
    skillName,
    layout,
    packageRoot: getAgentsPackageRoot(),
    monorepoRoot: getAgentsMonorepoRoot(),
    installedSkill,
    installedSkills,
  };
}
