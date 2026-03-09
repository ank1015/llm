import { mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  addSkill,
  createSystemPrompt,
  deleteSkill,
  listBundledSkills,
  listInstalledSkills,
} from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '../..');
const bundledSkillsRoot = join(packageRoot, 'skills');

function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error('Missing frontmatter');
  }

  const values: Record<string, string> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) {
      continue;
    }

    const key = item[1];
    let value = item[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

async function createArtifactDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'llm-agents-artifact-'));
}

describe('skills runtime', () => {
  it('exports the new artifact-local skill APIs and removes setupSkills', async () => {
    const agents = await import('../../src/index.js');

    expect(typeof agents.addSkill).toBe('function');
    expect(typeof agents.deleteSkill).toBe('function');
    expect(typeof agents.listBundledSkills).toBe('function');
    expect(typeof agents.listInstalledSkills).toBe('function');
    expect('setupSkills' in agents).toBe(false);
    expect('setUpSkills' in agents).toBe(false);
  });

  it('keeps bundled registry aligned with skill folders and frontmatter', async () => {
    const bundledSkills = await listBundledSkills();
    const registryNames = bundledSkills.map((skill) => skill.name).sort();

    const skillFolders = (await readdir(bundledSkillsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(registryNames).toEqual(skillFolders);

    for (const skill of bundledSkills) {
      const raw = await readFile(skill.path, 'utf-8');
      const frontmatter = parseFrontmatter(raw);
      expect(frontmatter.name).toBe(skill.name);
      expect(frontmatter.description).toBe(skill.description);
    }
  });

  it('installs bundled skills into artifact-local .max state and replaces existing copies', async () => {
    const artifactDir = await createArtifactDir();

    try {
      const installResult = await addSkill('llm-use', artifactDir);
      const resolvedArtifactDir = await realpath(artifactDir);
      expect(installResult.artifactDir).toBe(resolvedArtifactDir);
      expect(installResult.directory).toBe(join(resolvedArtifactDir, '.max', 'skills', 'llm-use'));
      expect(installResult.path).toBe(
        join(resolvedArtifactDir, '.max', 'skills', 'llm-use', 'SKILL.md')
      );

      const markerPath = join(installResult.directory, 'marker.txt');
      await writeFile(markerPath, 'stale\n', 'utf-8');

      await addSkill('llm-use', artifactDir);
      await expect(readFile(markerPath, 'utf-8')).rejects.toThrow();
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('lists installed skills only for the current artifact and returns none when missing', async () => {
    const artifactDir = await createArtifactDir();

    try {
      expect(await listInstalledSkills(artifactDir)).toEqual([]);

      await addSkill('browser-use', artifactDir);
      await addSkill('xlsx', artifactDir);

      const installed = await listInstalledSkills(artifactDir);
      expect(installed.map((skill) => skill.name)).toEqual(['browser-use', 'xlsx']);
      expect(
        installed.every((skill) => skill.path.startsWith(join(artifactDir, '.max', 'skills')))
      ).toBe(true);
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('deletes an installed skill from the current artifact', async () => {
    const artifactDir = await createArtifactDir();

    try {
      await addSkill('browser-use', artifactDir);
      await addSkill('xlsx', artifactDir);

      const deleted = await deleteSkill('browser-use', artifactDir);

      expect(deleted.name).toBe('browser-use');
      expect(deleted.deleted).toBe(true);
      expect(await listInstalledSkills(artifactDir)).toMatchObject([{ name: 'xlsx' }]);
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('builds system prompts from installed skills only', async () => {
    const artifactDir = await createArtifactDir();

    try {
      const emptyPrompt = await createSystemPrompt({
        projectName: 'sales',
        projectDir: '/tmp/project',
        artifactName: 'product',
        artifactDir,
      });
      expect(emptyPrompt).toContain('- none installed');
      expect(emptyPrompt).not.toContain('browser-use');
      expect(emptyPrompt).toContain('.max/temp');
      expect(emptyPrompt).toContain('scratchpad');
      expect(emptyPrompt).toContain('install dependencies');
      expect(emptyPrompt).not.toContain('.max/temp/scripts');
      expect(emptyPrompt).not.toContain('.max/node_modules');
      expect(emptyPrompt).not.toContain('max-skills');

      await addSkill('browser-use', artifactDir);
      const installedPrompt = await createSystemPrompt({
        projectName: 'sales',
        projectDir: '/tmp/project',
        artifactName: 'product',
        artifactDir,
      });

      expect(installedPrompt).toContain(
        join(artifactDir, '.max', 'skills', 'browser-use', 'SKILL.md')
      );
      expect(installedPrompt).toContain('browser-use');
      expect(installedPrompt).not.toContain('llm-use');
      expect(installedPrompt).not.toContain('pnpm exec tsx');
      expect(installedPrompt).not.toContain('.max/temp/scripts');
      expect(installedPrompt).not.toContain('.max/node_modules');
      expect(installedPrompt).not.toContain('max-skills');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('rejects unknown bundled skills', async () => {
    const artifactDir = await createArtifactDir();

    try {
      await expect(addSkill('does-not-exist', artifactDir)).rejects.toThrow(
        /Unknown bundled skill/
      );
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('rejects deleting a skill that is not installed', async () => {
    const artifactDir = await createArtifactDir();

    try {
      await expect(deleteSkill('browser-use', artifactDir)).rejects.toThrow(
        /Installed skill "browser-use" not found/
      );
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('documents the required browser-use reading order', async () => {
    const skillPath = join(packageRoot, 'skills', 'browser-use', 'SKILL.md');
    const raw = await readFile(skillPath, 'utf-8');

    expect(raw).toContain('## Required Reading Order');
    expect(raw).toContain('1. read [references/sdk-core.md]');
    expect(raw).toContain('2. read [references/modes.md]');
    expect(raw).toContain('3. choose exactly one deeper reference');
    expect(raw).not.toContain('script-environment.md');
  });
});

describe('skills regressions', () => {
  it('removes retired max-skills and setupSkills guidance from the agents package', async () => {
    const filesToCheck = [
      join(packageRoot, 'src'),
      join(packageRoot, 'skills'),
      join(packageRoot, 'SKILL_AUTHORING.md'),
    ];

    const violations: string[] = [];

    async function scanPath(path: string): Promise<void> {
      const pathStat = await stat(path);
      if (pathStat.isFile()) {
        const content = await readFile(path, 'utf-8');
        if (
          content.includes('max-skills') ||
          content.includes('setupSkills') ||
          content.includes('setUpSkills') ||
          content.includes('scripts/<artifact-name>')
        ) {
          violations.push(path);
        }
        return;
      }

      const statEntries = await readdir(path, { withFileTypes: true });
      for (const entry of statEntries) {
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) {
          await scanPath(entryPath);
          continue;
        }

        const content = await readFile(entryPath, 'utf-8');
        if (
          content.includes('max-skills') ||
          content.includes('setupSkills') ||
          content.includes('setUpSkills') ||
          content.includes('scripts/<artifact-name>')
        ) {
          violations.push(entryPath);
        }
      }
    }

    for (const path of filesToCheck) {
      await scanPath(path);
    }

    expect(violations).toEqual([]);
  });

  it('removes the retired repo-global browser-scripts guidance', async () => {
    const filesToCheck = [
      join(packageRoot, 'skills', 'browser-use'),
      resolve(packageRoot, '../extension/src/automation.md'),
    ];

    const violations: string[] = [];
    const retiredPatterns = [
      'packages/browser-scripts',
      'pnpm exec tsx scripts/',
      '.max/temp/scripts/browser-use',
      '.max/node_modules/.bin/tsx',
      'script-environment.md',
    ];

    async function scanPath(path: string): Promise<void> {
      const pathStat = await stat(path);
      if (pathStat.isFile()) {
        const content = await readFile(path, 'utf-8');
        if (retiredPatterns.some((pattern) => content.includes(pattern))) {
          violations.push(path);
        }
        return;
      }

      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        await scanPath(join(path, entry.name));
      }
    }

    for (const path of filesToCheck) {
      await scanPath(path);
    }

    expect(violations).toEqual([]);
  });
});
