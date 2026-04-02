import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSystemPrompt,
  listInstalledSkills,
} from '../../../src/system-prompts/general-agant.js';

let artifactDir = '';

beforeEach(async () => {
  artifactDir = await mkdtemp(join(tmpdir(), 'llm-agents-system-prompt-'));

  await mkdir(join(artifactDir, '.max', 'skills', 'pdf'), { recursive: true });
  await writeFile(join(artifactDir, '.max', 'skills', 'pdf', 'SKILL.md'), '# PDF skill\n', 'utf8');

  await mkdir(join(artifactDir, '.max', 'skills', 'manual-skill'), { recursive: true });
  await writeFile(
    join(artifactDir, '.max', 'skills', 'manual-skill', 'SKILL.md'),
    '# Manual skill\n',
    'utf8'
  );
});

afterEach(async () => {
  await rm(artifactDir, { recursive: true, force: true });
});

describe('general system prompt skills', () => {
  it('lists only registered installed skills with canonical registry metadata', async () => {
    const installedSkills = await listInstalledSkills(artifactDir);

    expect(installedSkills).toEqual([
      expect.objectContaining({
        name: 'pdf',
        link: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
        description: expect.stringContaining('PDF files'),
        path: join(artifactDir, '.max', 'skills', 'pdf', 'SKILL.md'),
      }),
    ]);
  });

  it('renders the registered installed skills into the system prompt', async () => {
    const prompt = await createSystemPrompt({
      projectName: 'Project Alpha',
      projectDir: '/tmp/project-alpha',
      artifactName: 'Artifact Alpha',
      artifactDir,
    });

    expect(prompt).toContain('name: pdf');
    expect(prompt).toContain(
      'description: Use this skill whenever the user wants to do anything with PDF files.'
    );
    expect(prompt).toContain(join(artifactDir, '.max', 'skills', 'pdf', 'SKILL.md'));
    expect(prompt).not.toContain('manual-skill');
  });
});
