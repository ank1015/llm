import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactDir } from '../../../src/core/artifact-dir/artifact-dir.js';
import {
  ArtifactSkillSourceError,
  ArtifactSkillSyncService,
} from '../../../src/core/artifact-dir/skills.js';
import { Project } from '../../../src/core/project/project.js';
import {
  createGitHubSkillArchive,
  createFetchResponse,
} from '../../helpers/github-skill-archive.js';
import { createTempServerConfig } from '../../helpers/server-fixture.js';

let cleanup: (() => Promise<void>) | null = null;
let artifactDir: ArtifactDir;

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-skill-sync');
  cleanup = fixture.cleanup;

  await Project.create({ name: 'Skill Project' });
  artifactDir = await ArtifactDir.create('skill-project', { name: 'Skill Artifact' });
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('ArtifactSkillSyncService', () => {
  it('installs a registered skill from a downloaded GitHub archive', async () => {
    const archive = await createGitHubSkillArchive();
    const fetchImpl = vi.fn(async () => createFetchResponse(archive));
    const service = new ArtifactSkillSyncService({ fetchImpl });

    const installedSkill = await service.installSkill(artifactDir.dirPath, 'pdf');

    expect(installedSkill).toMatchObject({
      name: 'pdf',
      link: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
      path: '.max/skills/pdf/SKILL.md',
    });
    expect(
      await readFile(join(artifactDir.dirPath, '.max', 'skills', 'pdf', 'reference.md'), 'utf8')
    ).toBe('reference');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reloads a skill by replacing the existing directory exactly', async () => {
    const archive = await createGitHubSkillArchive();
    const fetchImpl = vi.fn(async () => createFetchResponse(archive));
    const service = new ArtifactSkillSyncService({ fetchImpl });

    await service.installSkill(artifactDir.dirPath, 'pdf');
    await writeFile(join(artifactDir.dirPath, '.max', 'skills', 'pdf', 'stale.txt'), 'old', 'utf8');
    await service.reloadSkill(artifactDir.dirPath, 'pdf');

    await expect(
      readFile(join(artifactDir.dirPath, '.max', 'skills', 'pdf', 'stale.txt'), 'utf8')
    ).rejects.toThrow();
    expect(
      await readFile(join(artifactDir.dirPath, '.max', 'skills', 'pdf', 'SKILL.md'), 'utf8')
    ).toContain('PDF skill');
  });

  it('fails when the registered source folder is missing from the archive', async () => {
    const archive = await createGitHubSkillArchive({
      files: {
        'skills/other/SKILL.md': '# Wrong skill\n',
      },
    });
    const service = new ArtifactSkillSyncService({
      fetchImpl: vi.fn(async () => createFetchResponse(archive)),
    });

    const installPromise = service.installSkill(artifactDir.dirPath, 'pdf');
    await expect(installPromise).rejects.toThrow(ArtifactSkillSourceError);
    await expect(installPromise).rejects.toThrow(
      'Registered source folder "skills/pdf" was not found'
    );
  });

  it('fails when the downloaded source directory is missing SKILL.md', async () => {
    const archive = await createGitHubSkillArchive({
      files: {
        'skills/pdf/reference.md': 'reference only',
      },
    });
    const service = new ArtifactSkillSyncService({
      fetchImpl: vi.fn(async () => createFetchResponse(archive)),
    });

    await expect(service.installSkill(artifactDir.dirPath, 'pdf')).rejects.toThrow(
      'is missing SKILL.md'
    );
  });

  it('cleans up staging directories after a failed sync', async () => {
    const stagingRootParent = await mkdtemp(join(tmpdir(), 'llm-server-skill-sync-stage-'));
    const service = new ArtifactSkillSyncService({
      fetchImpl: vi.fn(async () => createFetchResponse(new TextEncoder().encode('not a tarball'))),
      stagingRootParent,
    });

    await expect(service.installSkill(artifactDir.dirPath, 'pdf')).rejects.toThrow(
      ArtifactSkillSourceError
    );
    expect(await readdir(stagingRootParent)).toEqual([]);

    await rm(stagingRootParent, { recursive: true, force: true });
  });
});
