import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  addSkill,
  createImage,
  createSystemPrompt,
  deleteSkill,
  editImage,
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
  it('exports the current skill APIs and helper-backed helpers', async () => {
    const agents = await import('../../src/index.js');

    expect(typeof agents.addSkill).toBe('function');
    expect(typeof agents.deleteSkill).toBe('function');
    expect(typeof agents.listBundledSkills).toBe('function');
    expect(typeof agents.listInstalledSkills).toBe('function');
    expect(typeof agents.createImage).toBe('function');
    expect(typeof agents.editImage).toBe('function');
    expect(agents.createImage).toBe(createImage);
    expect(agents.editImage).toBe(editImage);
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

    expect(registryNames).toEqual(['ai-images', 'web']);
    expect(registryNames).toEqual(skillFolders);

    for (const skill of bundledSkills) {
      const raw = await readFile(skill.path, 'utf-8');
      const frontmatter = parseFrontmatter(raw);
      expect(frontmatter.name).toBe(skill.name);
      expect(frontmatter.description).toBe(skill.description);
    }
  });

  it('installs bundled skills into artifact-local .max state and replaces existing copies', async () => {
    for (const skillName of ['ai-images', 'web'] as const) {
      const artifactDir = await createArtifactDir();

      try {
        const installResult = await addSkill(skillName, artifactDir);
        const resolvedArtifactDir = await realpath(artifactDir);
        const tempDir = join(resolvedArtifactDir, '.max', 'temp');
        const tempPackageJsonPath = join(tempDir, 'package.json');
        const tempTsconfigPath = join(tempDir, 'tsconfig.json');
        const tempScriptsDir = join(tempDir, 'scripts');
        expect(installResult.artifactDir).toBe(resolvedArtifactDir);
        expect(installResult.directory).toBe(
          join(resolvedArtifactDir, '.max', 'skills', skillName)
        );
        expect(installResult.path).toBe(
          join(resolvedArtifactDir, '.max', 'skills', skillName, 'SKILL.md')
        );
        expect(installResult.helperProject).toEqual({
          runtime: 'typescript',
          package: '@ank1015/llm-agents',
        });

        const tempPackageJson = JSON.parse(await readFile(tempPackageJsonPath, 'utf-8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        expect(tempPackageJson.dependencies?.['@ank1015/llm-agents']).toBeTruthy();
        expect(tempPackageJson.devDependencies?.tsx).toBeTruthy();
        await expect(readFile(tempTsconfigPath, 'utf-8')).resolves.toContain('"include"');
        await expect(readFile(join(tempScriptsDir, '.gitkeep'), 'utf-8')).rejects.toThrow();
        await expect(
          realpath(join(tempDir, 'node_modules', '@ank1015', 'llm-agents'))
        ).resolves.toBe(packageRoot);

        const markerPath = join(installResult.directory, 'marker.txt');
        await writeFile(markerPath, 'stale\n', 'utf-8');

        await addSkill(skillName, artifactDir);
        await expect(readFile(markerPath, 'utf-8')).rejects.toThrow();
      } finally {
        await rm(artifactDir, { recursive: true, force: true });
      }
    }
  });

  it('refreshes the temp helper workspace versions and node module links on reinstall', async () => {
    const artifactDir = await createArtifactDir();
    const staleDir = await mkdtemp(join(tmpdir(), 'llm-agents-stale-temp-'));

    try {
      await addSkill('web', artifactDir);

      const resolvedArtifactDir = await realpath(artifactDir);
      const tempDir = join(resolvedArtifactDir, '.max', 'temp');
      const tempPackageJsonPath = join(tempDir, 'package.json');
      const packageJson = JSON.parse(
        await readFile(join(packageRoot, 'package.json'), 'utf-8')
      ) as {
        version?: string;
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      const expectedTsxVersion =
        packageJson.devDependencies?.tsx ?? packageJson.dependencies?.tsx ?? '^4.19.0';
      const agentsLinkPath = join(tempDir, 'node_modules', '@ank1015', 'llm-agents');
      const tsxLinkPath = join(tempDir, 'node_modules', 'tsx');
      const tsxBinPath = join(
        tempDir,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
      );

      await writeFile(
        tempPackageJsonPath,
        `${JSON.stringify(
          {
            name: 'max-temp',
            private: true,
            type: 'module',
            dependencies: {
              '@ank1015/llm-agents': '0.0.0-stale',
            },
            devDependencies: {
              tsx: '0.0.0-stale',
            },
          },
          null,
          2
        )}\n`,
        'utf-8'
      );

      await rm(agentsLinkPath, { recursive: true, force: true });
      await rm(tsxLinkPath, { recursive: true, force: true });
      await rm(tsxBinPath, { force: true });
      await mkdir(agentsLinkPath, { recursive: true });
      await mkdir(tsxLinkPath, { recursive: true });
      await writeFile(tsxBinPath, 'stale\n', 'utf-8');

      await addSkill('ai-images', artifactDir);

      const refreshedPackageJson = JSON.parse(await readFile(tempPackageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      expect(refreshedPackageJson.dependencies?.['@ank1015/llm-agents']).toBe(
        packageJson.version ?? '0.0.4'
      );
      expect(refreshedPackageJson.devDependencies?.tsx).toBe(expectedTsxVersion);
      await expect(realpath(agentsLinkPath)).resolves.toBe(packageRoot);
      await expect(realpath(tsxLinkPath)).resolves.toBe(
        await realpath(join(packageRoot, 'node_modules', 'tsx'))
      );
      await expect(realpath(tsxBinPath)).resolves.toBe(
        await realpath(
          join(
            packageRoot,
            'node_modules',
            '.bin',
            process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
          )
        )
      );
    } finally {
      await rm(staleDir, { recursive: true, force: true });
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('lists installed skills only for the current artifact and returns none when missing', async () => {
    const artifactDir = await createArtifactDir();

    try {
      expect(await listInstalledSkills(artifactDir)).toEqual([]);

      await addSkill('ai-images', artifactDir);
      await addSkill('web', artifactDir);

      const installed = await listInstalledSkills(artifactDir);
      expect(installed.map((skill) => skill.name)).toEqual(['ai-images', 'web']);
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
      await addSkill('web', artifactDir);

      const deleted = await deleteSkill('web', artifactDir);

      expect(deleted.name).toBe('web');
      expect(deleted.deleted).toBe(true);
      expect(await listInstalledSkills(artifactDir)).toEqual([]);
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('builds system prompts from installed skills only', async () => {
    const artifactDir = await createArtifactDir();

    try {
      const emptyPrompt = await createSystemPrompt({
        projectName: 'media',
        projectDir: '/tmp/project',
        artifactName: 'campaign',
        artifactDir,
      });
      expect(emptyPrompt).toContain('- none installed');
      expect(emptyPrompt).not.toContain('ai-images');
      expect(emptyPrompt).not.toContain('web');
      expect(emptyPrompt).toContain('.max/temp');

      await addSkill('ai-images', artifactDir);
      await addSkill('web', artifactDir);
      const installedPrompt = await createSystemPrompt({
        projectName: 'media',
        projectDir: '/tmp/project',
        artifactName: 'campaign',
        artifactDir,
      });

      expect(installedPrompt).toContain(
        join(artifactDir, '.max', 'skills', 'ai-images', 'SKILL.md')
      );
      expect(installedPrompt).toContain(join(artifactDir, '.max', 'skills', 'web', 'SKILL.md'));
      expect(installedPrompt).toContain('ai-images');
      expect(installedPrompt).toContain('web');
      expect(installedPrompt).not.toContain('browser-use');
      expect(installedPrompt).not.toContain('llm-use');
      expect(installedPrompt).not.toContain('pptx');
      expect(installedPrompt).not.toContain('xlsx');
      expect(installedPrompt).toContain('helper-backed');
      expect(installedPrompt).toContain('@ank1015/llm-agents');
      expect(installedPrompt).toContain('.max/temp');
      expect(installedPrompt).toContain('TypeScript workspace');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('uses custom system prompt section overrides when provided', async () => {
    const artifactDir = await createArtifactDir();

    try {
      const prompt = await createSystemPrompt({
        projectName: 'media',
        projectDir: '/tmp/project',
        artifactName: 'campaign',
        artifactDir,
        identity: 'You are Nova. Focus on image tasks first.',
        tools: '- inspect: Inspect state\n- patch: Apply exact edits',
        tools_guidelines: '- Prefer minimal edits.\n- Summarize only the final result.',
        skills: '- Use custom skill policy only.',
        project_information: '- Custom project information block.',
        working_dir: '- Custom working directory guidance.',
        agent_state: '- Custom agent state guidance.',
        current_date: 'Current date: Override Day',
      });

      expect(prompt).toContain('You are Nova. Focus on image tasks first.');
      expect(prompt).toContain('- inspect: Inspect state');
      expect(prompt).toContain('- Prefer minimal edits.');
      expect(prompt).toContain('- Use custom skill policy only.');
      expect(prompt).toContain('- Custom project information block.');
      expect(prompt).toContain('- Custom working directory guidance.');
      expect(prompt).toContain('- Custom agent state guidance.');
      expect(prompt).toContain('Current date: Override Day');

      expect(prompt).not.toContain('You are Max. Max is an intelligent assistant.');
      expect(prompt).not.toContain('- read: Read file contents');
      expect(prompt).not.toContain('Prefer grep, find, and ls over bash');
      expect(prompt).not.toContain('- none installed');
      expect(prompt).not.toContain('Artifact-local agent state lives under:');
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
      await expect(deleteSkill('ai-images', artifactDir)).rejects.toThrow(
        /Installed skill "ai-images" not found/
      );
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });

  it('documents the required ai-images reading order', async () => {
    const skillPath = join(packageRoot, 'skills', 'ai-images', 'SKILL.md');
    const chooseModelPath = join(
      packageRoot,
      'skills',
      'ai-images',
      'references',
      'choose-model.md'
    );
    const createPath = join(packageRoot, 'skills', 'ai-images', 'references', 'create.md');
    const editPath = join(packageRoot, 'skills', 'ai-images', 'references', 'edit.md');

    const [skillRaw, chooseModelRaw, createRaw, editRaw] = await Promise.all([
      readFile(skillPath, 'utf-8'),
      readFile(chooseModelPath, 'utf-8'),
      readFile(createPath, 'utf-8'),
      readFile(editPath, 'utf-8'),
    ]);

    expect(skillRaw).toContain('## Required Reading Order');
    expect(skillRaw).toContain('[references/choose-model.md](references/choose-model.md)');
    expect(skillRaw).toContain('[references/create.md](references/create.md)');
    expect(skillRaw).toContain('[references/edit.md](references/edit.md)');
    expect(chooseModelRaw).toContain('gemini-3-pro-image-preview');
    expect(chooseModelRaw).toContain('If the user explicitly names a model, use that model.');
    expect(createRaw).toContain('[choose-model.md](choose-model.md)');
    expect(editRaw).toContain('[choose-model.md](choose-model.md)');
    expect(createRaw).toContain("import { createImage } from '@ank1015/llm-agents';");
    expect(editRaw).toContain("import { editImage } from '@ank1015/llm-agents';");
  });

  it('documents the required web reading order', async () => {
    const skillPath = join(packageRoot, 'skills', 'web', 'SKILL.md');
    const apiPath = join(packageRoot, 'skills', 'web', 'references', 'api.md');
    const workflowPath = join(packageRoot, 'skills', 'web', 'references', 'workflow.md');
    const readPath = join(packageRoot, 'skills', 'web', 'references', 'read.md');
    const interactPath = join(packageRoot, 'skills', 'web', 'references', 'interact.md');
    const debugPath = join(packageRoot, 'skills', 'web', 'references', 'debug.md');
    const browserStatePath = join(packageRoot, 'skills', 'web', 'references', 'browser-state.md');
    const downloadsPath = join(packageRoot, 'skills', 'web', 'references', 'downloads.md');
    const recipesPath = join(packageRoot, 'skills', 'web', 'references', 'recipes.md');

    const [
      skillRaw,
      apiRaw,
      workflowRaw,
      readRaw,
      interactRaw,
      debugRaw,
      browserStateRaw,
      downloadsRaw,
      recipesRaw,
    ] = await Promise.all([
      readFile(skillPath, 'utf-8'),
      readFile(apiPath, 'utf-8'),
      readFile(workflowPath, 'utf-8'),
      readFile(readPath, 'utf-8'),
      readFile(interactPath, 'utf-8'),
      readFile(debugPath, 'utf-8'),
      readFile(browserStatePath, 'utf-8'),
      readFile(downloadsPath, 'utf-8'),
      readFile(recipesPath, 'utf-8'),
    ]);

    expect(skillRaw).toContain('## Required Reading Order');
    expect(skillRaw).toContain('[references/api.md](references/api.md)');
    expect(skillRaw).toContain('[references/workflow.md](references/workflow.md)');
    expect(skillRaw).toContain('[references/read.md](references/read.md)');
    expect(skillRaw).toContain('[references/interact.md](references/interact.md)');
    expect(skillRaw).toContain('[references/debug.md](references/debug.md)');
    expect(skillRaw).toContain('[references/browser-state.md](references/browser-state.md)');
    expect(skillRaw).toContain('[references/downloads.md](references/downloads.md)');
    expect(skillRaw).toContain('[references/recipes.md](references/recipes.md)');
    expect(skillRaw).toContain('## Main Helpers');
    expect(apiRaw).toContain('## Top-Level Helpers');
    expect(apiRaw).toContain(
      'function connectWeb(options?: ConnectWebOptions): Promise<WebBrowser>;'
    );
    expect(apiRaw).toContain('fn: (browser: WebBrowser) => Promise<T>');
    expect(apiRaw).toContain('waitFor(options: WebWaitForOptions): Promise<void>;');
    expect(apiRaw).toContain('captureNetwork<T>(');
    expect(apiRaw).toContain(
      'cdp<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;'
    );
    expect(workflowRaw).toContain('## Default Algorithm');
    expect(workflowRaw).toContain('Use `withWebBrowser(...)` by default.');
    expect(readRaw).toContain("import { withWebBrowser } from '@ank1015/llm-agents';");
    expect(interactRaw).toContain('For most web app interactions, combine:');
    expect(debugRaw).toContain('tab.captureNetwork(fn, options?)');
    expect(browserStateRaw).toContain('browser.closeOtherTabs');
    expect(downloadsRaw).toContain('tab.uploadFiles(selector, paths)');
    expect(recipesRaw).toContain("import { withWebBrowser } from '@ank1015/llm-agents';");
    expect(recipesRaw).toContain('const browser = await connectWeb({ launch: true });');
  });
});

describe('skills regressions', () => {
  it('removes retired bundled skill names from the current package surface', async () => {
    const registryRaw = await readFile(join(packageRoot, 'skills', 'registry.json'), 'utf-8');

    expect(registryRaw).not.toContain('browser-use');
    expect(registryRaw).not.toContain('llm-use');
    expect(registryRaw).not.toContain('pptx');
    expect(registryRaw).not.toContain('xlsx');
  });
});
