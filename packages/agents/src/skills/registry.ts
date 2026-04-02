import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_JSON_FILENAME = 'package.json';
const currentFileDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = findPackageRoot(currentFileDir);
const registryPath = join(packageRoot, 'skills', 'registry.json');

type RegistryFileEntry = {
  name: string;
  link: string;
  description: string;
};

export interface RegisteredSkillSource {
  owner: string;
  repo: string;
  ref: string;
  subpath: string;
}

export interface RegisteredSkillEntry {
  name: string;
  link: string;
  description: string;
  source: RegisteredSkillSource;
}

export async function listRegisteredSkills(): Promise<RegisteredSkillEntry[]> {
  const raw = await readFile(registryPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Skill registry must be an array: ${registryPath}`);
  }

  const registry: RegisteredSkillEntry[] = [];
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.name !== 'string' ||
      typeof entry.link !== 'string' ||
      typeof entry.description !== 'string'
    ) {
      throw new Error(`Skill registry contains an invalid entry: ${registryPath}`);
    }

    const registryEntry = entry as RegistryFileEntry;
    registry.push({
      name: registryEntry.name,
      link: registryEntry.link,
      description: registryEntry.description,
      source: parseGitHubTreeLink(registryEntry.link),
    });
  }

  registry.sort((left, right) => left.name.localeCompare(right.name));
  return registry;
}

export async function getRegisteredSkill(
  skillName: string
): Promise<RegisteredSkillEntry | undefined> {
  const registry = await listRegisteredSkills();
  return registry.find((entry) => entry.name === skillName);
}

function parseGitHubTreeLink(link: string): RegisteredSkillSource {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error(`Skill registry entry must be a valid URL: ${link}`);
  }

  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error(`Skill registry entry must point to github.com: ${link}`);
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const [owner, repo, treeKeyword, ref, ...subpathSegments] = segments;
  const subpath = subpathSegments.join('/');

  if (!owner || !repo || treeKeyword !== 'tree' || !ref || !subpath) {
    throw new Error(`Skill registry entry must be a GitHub tree URL: ${link}`);
  }

  return {
    owner,
    repo,
    ref,
    subpath,
  };
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;

  while (true) {
    if (existsSync(join(dir, PACKAGE_JSON_FILENAME))) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      throw new Error(`Unable to locate package root from ${startDir}`);
    }

    dir = parentDir;
  }
}
