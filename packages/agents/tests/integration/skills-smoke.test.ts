import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { runSkillTesterBuild } from '../../src/agents/skills/tester.js';
import {
  IMAGE_MODEL_IDS,
  WebBrowser,
  WebDebuggerSession,
  WebTab,
  addSkill,
  connectWeb,
  createImage,
  editImage,
  listBundledSkills,
  withWebBrowser,
} from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '../..');

beforeAll(async () => {
  await runSkillTesterBuild();
}, 600_000);

describe('helper-backed skill exports', () => {
  it('exposes the ai-image and web helper functions from the package root', () => {
    expect(typeof createImage).toBe('function');
    expect(typeof editImage).toBe('function');
    expect(typeof connectWeb).toBe('function');
    expect(typeof withWebBrowser).toBe('function');
    expect(typeof WebBrowser).toBe('function');
    expect(typeof WebTab).toBe('function');
    expect(typeof WebDebuggerSession).toBe('function');
    expect(IMAGE_MODEL_IDS).toEqual([
      'gpt-5.4',
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
    ]);
  });

  it('lists the bundled helper-backed skills', async () => {
    const bundledSkills = await listBundledSkills();

    expect(bundledSkills).toHaveLength(2);
    expect(bundledSkills.map((skill) => skill.name).sort()).toEqual(['ai-images', 'web']);
    expect(bundledSkills.find((skill) => skill.name === 'ai-images')?.path).toBe(
      join(packageRoot, 'skills', 'ai-images', 'SKILL.md')
    );
    expect(bundledSkills.find((skill) => skill.name === 'web')?.path).toBe(
      join(packageRoot, 'skills', 'web', 'SKILL.md')
    );
  });

  it('loads the skills module through tsx without top-level initialization errors', () => {
    const tsxPath = join(
      packageRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
    );
    const skillsModuleUrl = pathToFileURL(join(packageRoot, 'src', 'agents', 'skills', 'index.ts'));
    const result = spawnSync(
      tsxPath,
      ['--eval', `import(${JSON.stringify(skillsModuleUrl.href)}).then(() => console.log('ok'));`],
      {
        cwd: packageRoot,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
    expect(result.stderr.trim()).toBe('');
  });
});

describe('bundled skill docs', () => {
  it('keeps the ai-images overview and task-specific references in sync', async () => {
    const [overview, createReference, editReference] = await Promise.all([
      readFile(join(packageRoot, 'skills', 'ai-images', 'SKILL.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'ai-images', 'references', 'create.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'ai-images', 'references', 'edit.md'), 'utf-8'),
    ]);

    expect(overview).toContain('## When To Use');
    expect(overview).toContain('## Required Reading Order');
    expect(createReference).toContain('## Request Shape');
    expect(createReference).toContain('## OpenAI Options');
    expect(editReference).toContain('## Request Shape');
    expect(editReference).toContain('## Supported Inputs');
  });

  it('keeps the web overview and focused references in sync', async () => {
    const [
      overview,
      apiReference,
      workflowReference,
      readReference,
      interactReference,
      debugReference,
      downloadsReference,
    ] = await Promise.all([
      readFile(join(packageRoot, 'skills', 'web', 'SKILL.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'web', 'references', 'api.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'web', 'references', 'workflow.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'web', 'references', 'read.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'web', 'references', 'interact.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'web', 'references', 'debug.md'), 'utf-8'),
      readFile(join(packageRoot, 'skills', 'web', 'references', 'downloads.md'), 'utf-8'),
    ]);

    expect(overview).toContain('## When To Use');
    expect(overview).toContain('## Required Reading Order');
    expect(overview).toContain('## Main Helpers');
    expect(apiReference).toContain('## Imports');
    expect(apiReference).toContain('## `WebBrowser`');
    expect(apiReference).toContain('## `WebTab`');
    expect(workflowReference).toContain('## Choose The Task Mode');
    expect(workflowReference).toContain('## Which Helper To Use');
    expect(readReference).toContain('## Primary Helpers');
    expect(interactReference).toContain('## Common DOM Patterns');
    expect(debugReference).toContain('## Recommended Network Workflow');
    expect(downloadsReference).toContain('## Upload Workflow');
  });
});

describe('helper-backed temp workspace', () => {
  it('prepares a runnable TypeScript helper workspace under .max/temp', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'llm-agents-skill-smoke-'));

    try {
      await addSkill('web', artifactDir);

      const tempDir = join(artifactDir, '.max', 'temp');
      const scriptPath = join(tempDir, 'scripts', 'smoke.ts');
      const tsxPath = join(
        tempDir,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
      );

      await writeFile(
        scriptPath,
        "import { WebBrowser, WebDebuggerSession, WebTab, connectWeb, withWebBrowser } from '@ank1015/llm-agents';\nconsole.log([typeof connectWeb, typeof withWebBrowser, typeof WebBrowser, typeof WebTab, typeof WebDebuggerSession].join(','));\n",
        'utf-8'
      );

      const result = spawnSync(tsxPath, [scriptPath], {
        cwd: tempDir,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('function,function,function,function,function');
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});
