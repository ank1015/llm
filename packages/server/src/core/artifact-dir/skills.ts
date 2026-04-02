import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';

import { getRegisteredSkill, listRegisteredSkills } from '@ank1015/llm-agents';

import { ensureDir, pathExists } from '../storage/fs.js';

import type { ArtifactInstalledSkill, RegisteredSkill } from '../../types/index.js';
import type { RegisteredSkillEntry as AgentRegisteredSkillEntry } from '@ank1015/llm-agents';

const execFileAsync = promisify(execFile);
const MAX_DIR_NAME = '.max';
const INSTALLED_SKILLS_DIR_NAME = 'skills';
const SKILL_MARKDOWN_FILENAME = 'SKILL.md';

export class UnknownArtifactSkillError extends Error {
  constructor(skillName: string) {
    super(`Unknown registered skill "${skillName}"`);
    this.name = 'UnknownArtifactSkillError';
  }
}

export class ArtifactSkillAlreadyInstalledError extends Error {
  constructor(skillName: string) {
    super(`Skill "${skillName}" is already installed in this artifact`);
    this.name = 'ArtifactSkillAlreadyInstalledError';
  }
}

export class ArtifactSkillNotInstalledError extends Error {
  constructor(skillName: string) {
    super(`Skill "${skillName}" is not installed in this artifact`);
    this.name = 'ArtifactSkillNotInstalledError';
  }
}

export class ArtifactSkillSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactSkillSourceError';
  }
}

type ArtifactSkillSyncServiceOptions = {
  fetchImpl?: typeof fetch;
  stagingRootParent?: string;
};

export class ArtifactSkillSyncService {
  constructor(private readonly options: ArtifactSkillSyncServiceOptions = {}) {}

  async listAvailableSkills(): Promise<RegisteredSkill[]> {
    const skills = await listRegisteredSkills();
    return skills.map((skill) => toRegisteredSkill(skill));
  }

  async listInstalledSkills(artifactDir: string): Promise<ArtifactInstalledSkill[]> {
    const skillsDir = getSkillsDirectory(artifactDir);
    if (!(await pathExists(skillsDir))) {
      return [];
    }

    const entries = await readdir(skillsDir, { withFileTypes: true });
    const installedSkills: ArtifactInstalledSkill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const registeredSkill = await getRegisteredSkill(entry.name);
      if (!registeredSkill) {
        continue;
      }

      const skillFilePath = getSkillFilePath(artifactDir, entry.name);
      const skillFileStats = await stat(skillFilePath).catch(() => null);
      if (!skillFileStats?.isFile()) {
        continue;
      }

      installedSkills.push(
        toInstalledSkill(registeredSkill, normalizeRelativePath(artifactDir, skillFilePath))
      );
    }

    installedSkills.sort((left, right) => left.name.localeCompare(right.name));
    return installedSkills;
  }

  async installSkill(artifactDir: string, skillName: string): Promise<ArtifactInstalledSkill> {
    const registeredSkill = await requireRegisteredSkill(skillName);
    const targetDirectory = getSkillDirectory(artifactDir, registeredSkill.name);

    if (await pathExists(targetDirectory)) {
      throw new ArtifactSkillAlreadyInstalledError(registeredSkill.name);
    }

    await ensureDir(getSkillsDirectory(artifactDir));
    await this.syncRegisteredSkillDirectory(registeredSkill, targetDirectory, false);

    return toInstalledSkill(
      registeredSkill,
      normalizeRelativePath(artifactDir, getSkillFilePath(artifactDir, registeredSkill.name))
    );
  }

  async reloadSkill(artifactDir: string, skillName: string): Promise<ArtifactInstalledSkill> {
    const registeredSkill = await requireRegisteredSkill(skillName);
    const targetDirectory = getSkillDirectory(artifactDir, registeredSkill.name);

    if (!(await pathExists(targetDirectory))) {
      throw new ArtifactSkillNotInstalledError(registeredSkill.name);
    }

    await ensureDir(getSkillsDirectory(artifactDir));
    await this.syncRegisteredSkillDirectory(registeredSkill, targetDirectory, true);

    return toInstalledSkill(
      registeredSkill,
      normalizeRelativePath(artifactDir, getSkillFilePath(artifactDir, registeredSkill.name))
    );
  }

  async deleteSkill(artifactDir: string, skillName: string): Promise<void> {
    const registeredSkill = await requireRegisteredSkill(skillName);
    const targetDirectory = getSkillDirectory(artifactDir, registeredSkill.name);

    if (!(await pathExists(targetDirectory))) {
      throw new ArtifactSkillNotInstalledError(registeredSkill.name);
    }

    await rm(targetDirectory, { recursive: true, force: false });
  }

  private async syncRegisteredSkillDirectory(
    skill: AgentRegisteredSkillEntry,
    targetDirectory: string,
    replaceExisting: boolean
  ): Promise<void> {
    const stagingRoot = await mkdtemp(
      join(this.options.stagingRootParent ?? tmpdir(), 'llm-server-skill-sync-')
    );
    const archivePath = join(stagingRoot, 'skill.tar.gz');
    const extractDir = join(stagingRoot, 'extract');
    const tempTargetDirectory = join(
      dirname(targetDirectory),
      `.${skill.name}.tmp-${randomUUID()}`
    );
    const backupDirectory = join(dirname(targetDirectory), `.${skill.name}.bak-${randomUUID()}`);

    try {
      await mkdir(extractDir, { recursive: true });
      const response = await this.getFetch()(buildGitHubArchiveUrl(skill), {
        redirect: 'follow',
      });
      if (!response.ok) {
        throw new ArtifactSkillSourceError(
          `Failed to download skill "${skill.name}" from GitHub (${response.status})`
        );
      }

      const archiveBytes = new Uint8Array(await response.arrayBuffer());
      await writeFile(archivePath, archiveBytes);
      await extractTarArchive(archivePath, extractDir);

      const sourceDirectory = await resolveExtractedSkillDirectory(extractDir, skill);
      await cp(sourceDirectory, tempTargetDirectory, { recursive: true, force: true });

      if (replaceExisting && (await pathExists(targetDirectory))) {
        await rename(targetDirectory, backupDirectory);
      }

      await rename(tempTargetDirectory, targetDirectory);

      if (await pathExists(backupDirectory)) {
        await rm(backupDirectory, { recursive: true, force: true });
      }
    } catch (error) {
      if (await pathExists(backupDirectory)) {
        if (!(await pathExists(targetDirectory))) {
          await rename(backupDirectory, targetDirectory).catch(() => undefined);
        } else {
          await rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
        }
      }

      if (error instanceof ArtifactSkillSourceError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown skill sync failure';
      throw new ArtifactSkillSourceError(message);
    } finally {
      await rm(tempTargetDirectory, { recursive: true, force: true }).catch(() => undefined);
      await rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private getFetch(): typeof fetch {
    return this.options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }
}

export const artifactSkillSyncService = new ArtifactSkillSyncService();

async function requireRegisteredSkill(skillName: string): Promise<AgentRegisteredSkillEntry> {
  const registeredSkill = await getRegisteredSkill(skillName);
  if (!registeredSkill) {
    throw new UnknownArtifactSkillError(skillName);
  }

  return registeredSkill;
}

function buildGitHubArchiveUrl(skill: AgentRegisteredSkillEntry): string {
  return `https://codeload.github.com/${encodeURIComponent(skill.source.owner)}/${encodeURIComponent(skill.source.repo)}/tar.gz/${encodeURIComponent(skill.source.ref)}`;
}

async function extractTarArchive(archivePath: string, extractDir: string): Promise<void> {
  try {
    const result = await execFileAsync('tar', ['xzf', archivePath, '-C', extractDir], {
      encoding: 'utf8',
    });

    if (result.stderr?.trim()) {
      throw new ArtifactSkillSourceError(result.stderr.trim());
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to extract skill archive';
    throw new ArtifactSkillSourceError(`Failed to extract skill archive: ${message}`);
  }
}

async function resolveExtractedSkillDirectory(
  extractDir: string,
  skill: AgentRegisteredSkillEntry
): Promise<string> {
  const extractedEntries = await readdir(extractDir, { withFileTypes: true });
  const rootDirectory = extractedEntries.find((entry) => entry.isDirectory());

  if (!rootDirectory) {
    throw new ArtifactSkillSourceError(
      `Downloaded archive for "${skill.name}" did not contain a repository root`
    );
  }

  const sourceDirectory = join(extractDir, rootDirectory.name, skill.source.subpath);
  const sourceStats = await stat(sourceDirectory).catch(() => null);
  if (!sourceStats?.isDirectory()) {
    throw new ArtifactSkillSourceError(
      `Registered source folder "${skill.source.subpath}" was not found in the downloaded archive for "${skill.name}"`
    );
  }

  const skillFilePath = join(sourceDirectory, SKILL_MARKDOWN_FILENAME);
  const skillFileStats = await stat(skillFilePath).catch(() => null);
  if (!skillFileStats?.isFile()) {
    throw new ArtifactSkillSourceError(
      `Registered skill "${skill.name}" is missing ${SKILL_MARKDOWN_FILENAME} in the downloaded archive`
    );
  }

  return sourceDirectory;
}

function toRegisteredSkill(skill: AgentRegisteredSkillEntry): RegisteredSkill {
  return {
    name: skill.name,
    link: skill.link,
    description: skill.description,
  };
}

function toInstalledSkill(skill: AgentRegisteredSkillEntry, path: string): ArtifactInstalledSkill {
  return {
    ...toRegisteredSkill(skill),
    path,
  };
}

function getSkillsDirectory(artifactDir: string): string {
  return join(artifactDir, MAX_DIR_NAME, INSTALLED_SKILLS_DIR_NAME);
}

function getSkillDirectory(artifactDir: string, skillName: string): string {
  return join(getSkillsDirectory(artifactDir), skillName);
}

function getSkillFilePath(artifactDir: string, skillName: string): string {
  return join(getSkillDirectory(artifactDir, skillName), SKILL_MARKDOWN_FILENAME);
}

function normalizeRelativePath(rootDir: string, absolutePath: string): string {
  return relative(rootDir, absolutePath).replace(/\\/g, '/');
}
