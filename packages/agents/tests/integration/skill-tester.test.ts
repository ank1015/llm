import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  prepareSkillTesterWorkspace,
  runSkillTesterBuild,
} from '../../src/agents/skills/tester.js';

describe('skill tester workspace', () => {
  beforeAll(async () => {
    await runSkillTesterBuild();
  }, 600_000);

  it('prepares a runnable local tester workspace with skills, temp, and node_modules', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'llm-agents-skill-tester-smoke-'));

    try {
      const prepared = await prepareSkillTesterWorkspace('web', {
        workspaceRoot,
        buildPackages: async () => {},
      });
      const scriptPath = join(prepared.layout.tempDir, 'scripts', 'smoke.ts');
      const tsxPath = join(
        prepared.layout.tempDir,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
      );

      expect(prepared.installedSkills.map((skill) => skill.name)).toEqual(['web']);
      await expect(readdir(prepared.layout.skillsDir)).resolves.toContain('web');
      await expect(readdir(prepared.layout.rootDir)).resolves.toEqual(
        expect.arrayContaining(['node_modules', 'skills', 'temp'])
      );

      await writeFile(
        scriptPath,
        "import { WebBrowser, WebDebuggerSession, WebTab, connectWeb, withWebBrowser } from '@ank1015/llm-agents';\nconsole.log([typeof connectWeb, typeof withWebBrowser, typeof WebBrowser, typeof WebTab, typeof WebDebuggerSession].join(','));\n",
        'utf-8'
      );

      const result = spawnSync(tsxPath, [scriptPath], {
        cwd: prepared.layout.tempDir,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('function,function,function,function,function');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 600_000);

  it('prunes previously installed skills when switching the requested tester skill', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'llm-agents-skill-tester-switch-'));

    try {
      await prepareSkillTesterWorkspace('web', {
        workspaceRoot,
        buildPackages: async () => {},
      });
      const prepared = await prepareSkillTesterWorkspace('ai-images', {
        workspaceRoot,
        buildPackages: async () => {},
      });

      expect(await readdir(prepared.layout.skillsDir)).toEqual(['ai-images']);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }, 600_000);
});
