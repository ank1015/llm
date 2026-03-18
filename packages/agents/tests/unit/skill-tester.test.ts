import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createArtifactSkillWorkspaceLayout,
  createSkillTesterWorkspaceLayout,
  getAgentsPackageRoot,
  readBundledSkillMetadata,
} from '../../src/agents/skills/runtime.js';
import { prepareSkillTesterWorkspace } from '../../src/agents/skills/tester.js';
import {
  createSkillTesterSystemPromptOverrides,
  resolveSkillTesterTargetSkill,
} from '../../src/cli/skill-tester.js';

const cleanupPaths: string[] = [];

async function createWorkspaceRoot(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'llm-agents-skill-tester-'));
  cleanupPaths.push(workspaceRoot);
  return workspaceRoot;
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('skill tester workspace layout', () => {
  it('keeps the standard artifact workspace rooted under .max', () => {
    const layout = createArtifactSkillWorkspaceLayout('/tmp/demo-artifact');

    expect(layout.rootDir).toBe('/tmp/demo-artifact');
    expect(layout.stateDir).toBe('/tmp/demo-artifact/.max');
    expect(layout.skillsDir).toBe('/tmp/demo-artifact/.max/skills');
    expect(layout.tempDir).toBe('/tmp/demo-artifact/.max/temp');
    expect(layout.nodeModulesDir).toBe('/tmp/demo-artifact/.max/node_modules');
  });

  it('resolves the tester workspace with skills, temp, and node_modules at the root', async () => {
    const workspaceRoot = await createWorkspaceRoot();

    const layout = createSkillTesterWorkspaceLayout(workspaceRoot);

    expect(layout.rootDir).toBe(workspaceRoot);
    expect(layout.stateDir).toBe(workspaceRoot);
    expect(layout.skillsDir).toBe(join(workspaceRoot, 'skills'));
    expect(layout.tempDir).toBe(join(workspaceRoot, 'temp'));
    expect(layout.nodeModulesDir).toBe(join(workspaceRoot, 'node_modules'));
  });
});

describe('skill tester helpers', () => {
  it('requires exactly one skill name argument', () => {
    expect(() => resolveSkillTesterTargetSkill([])).toThrow(/Missing skill name/);
    expect(() => resolveSkillTesterTargetSkill(['web', 'ai-images'])).toThrow(
      /Expected exactly one skill name/
    );
    expect(resolveSkillTesterTargetSkill(['web'])).toBe('web');
    expect(resolveSkillTesterTargetSkill(['--', 'web'])).toBe('web');
  });

  it('fails unknown skills before attempting the local build', async () => {
    let buildCalls = 0;

    await expect(
      prepareSkillTesterWorkspace('does-not-exist', {
        buildPackages: async () => {
          buildCalls += 1;
        },
      })
    ).rejects.toThrow(/Unknown bundled skill/);

    expect(buildCalls).toBe(0);
  });

  it('writes a monorepo-local package dependency into the tester temp workspace', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    let buildCalls = 0;

    const prepared = await prepareSkillTesterWorkspace('web', {
      workspaceRoot,
      buildPackages: async () => {
        buildCalls += 1;
      },
    });

    const packageJson = JSON.parse(
      await readFile(join(prepared.layout.tempDir, 'package.json'), 'utf-8')
    ) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    const expectedDependency = `file:${relative(
      prepared.layout.tempDir,
      getAgentsPackageRoot()
    ).replaceAll('\\', '/')}`;

    expect(buildCalls).toBe(1);
    expect(packageJson.name).toBe('llm-agents-skill-tester-temp');
    expect(packageJson.dependencies?.['@ank1015/llm-agents']).toBe(expectedDependency);
    expect(prepared.installedSkills.map((skill) => skill.name)).toEqual(['web']);
  });

  it('builds tester prompt overrides without .max references', async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const bundledSkill = await readBundledSkillMetadata('web');
    const skillsDir = join(workspaceRoot, 'skills');
    const tempDir = join(workspaceRoot, 'temp');
    const overrides = createSkillTesterSystemPromptOverrides({
      packageRoot: getAgentsPackageRoot(),
      workspaceRoot,
      skillsDir,
      tempDir,
      installedSkills: [
        {
          ...bundledSkill,
          stateDir: workspaceRoot,
          skillsDir,
          tempDir,
          directory: join(skillsDir, 'web'),
        },
      ],
    });

    expect(overrides.skills).toContain(skillsDir);
    expect(overrides.skills).toContain(tempDir);
    expect(overrides.project_information).toContain(workspaceRoot);
    expect(overrides.working_dir).toContain(workspaceRoot);
    expect(overrides.agent_state).toContain(tempDir);

    expect(overrides.skills).not.toContain('.max');
    expect(overrides.agent_state).not.toContain('.max');
  });
});
