import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  IMAGE_MODEL_IDS,
  addSkill,
  createImage,
  editImage,
  listBundledSkills,
} from '../../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '../..');

describe('helper-backed skill exports', () => {
  it('exposes the ai-image helper functions from the package root', () => {
    expect(typeof createImage).toBe('function');
    expect(typeof editImage).toBe('function');
    expect(IMAGE_MODEL_IDS).toEqual([
      'gpt-5.4',
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
    ]);
  });

  it('lists ai-images as the only bundled skill', async () => {
    const bundledSkills = await listBundledSkills();

    expect(bundledSkills).toHaveLength(1);
    expect(bundledSkills[0]?.name).toBe('ai-images');
    expect(bundledSkills[0]?.path).toBe(join(packageRoot, 'skills', 'ai-images', 'SKILL.md'));
  });
});

describe('bundled skill docs', () => {
  it('keeps the overview and task-specific references in sync', async () => {
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
});

describe('helper-backed temp workspace', () => {
  it('prepares a runnable TypeScript helper workspace under .max/temp', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'llm-agents-skill-smoke-'));

    try {
      await addSkill('ai-images', artifactDir);

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
        "import { IMAGE_MODEL_IDS } from '@ank1015/llm-agents';\nconsole.log(IMAGE_MODEL_IDS.join(','));\n",
        'utf-8'
      );

      const result = spawnSync(tsxPath, [scriptPath], {
        cwd: tempDir,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(IMAGE_MODEL_IDS.join(','));
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});
