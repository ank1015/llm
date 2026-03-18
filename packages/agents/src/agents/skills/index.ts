import { existsSync } from 'fs';
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_JSON_FILENAME = 'package.json';
const currentFileDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = findPackageRoot(currentFileDir);
const bundledSkillsDir = join(packageRoot, 'skills');
const bundledRegistryPath = join(bundledSkillsDir, 'registry.json');
const packageNodeModulesDir = join(packageRoot, 'node_modules');

export const MAX_DIR_NAME = '.max';
export const INSTALLED_SKILLS_DIR_NAME = 'skills';
export const TEMP_DIR_NAME = 'temp';
const TEMP_SCRIPTS_DIR_NAME = 'scripts';

export interface SkillHelperProjectConfig {
  runtime: 'typescript';
  package: '@ank1015/llm-agents';
}

export interface SkillRegistryEntry {
  name: string;
  description: string;
  path: string;
  helperProject?: SkillHelperProjectConfig;
}

export interface BundledSkillEntry extends SkillRegistryEntry {
  directory: string;
}

export interface InstalledSkillEntry extends SkillRegistryEntry {
  artifactDir: string;
  maxDir: string;
  skillsDir: string;
  tempDir: string;
  directory: string;
  helperProject?: SkillHelperProjectConfig;
}

export interface AddSkillResult extends InstalledSkillEntry {
  sourceDirectory: string;
  sourcePath: string;
}

export interface DeleteSkillResult extends InstalledSkillEntry {
  deleted: true;
}

interface RegistryFileEntry {
  name: string;
  description: string;
  helperProject?: SkillHelperProjectConfig;
}

export async function listBundledSkills(): Promise<BundledSkillEntry[]> {
  const registry = await readBundledRegistry();

  return registry.map((entry) => {
    const directory = join(bundledSkillsDir, entry.name);
    const path = join(directory, 'SKILL.md');

    return {
      name: entry.name,
      description: entry.description,
      directory,
      path,
      ...(entry.helperProject ? { helperProject: entry.helperProject } : {}),
    };
  });
}

export async function addSkill(skillName: string, artifactDir: string): Promise<AddSkillResult> {
  const bundledSkill = await getBundledSkill(skillName);

  await mkdir(artifactDir, { recursive: true });
  const resolvedArtifactDir = await realpath(artifactDir);
  const artifactPaths = getArtifactPaths(resolvedArtifactDir);

  await mkdir(artifactPaths.maxDir, { recursive: true });
  await mkdir(artifactPaths.skillsDir, { recursive: true });
  await mkdir(artifactPaths.tempDir, { recursive: true });
  await ensureArtifactNodeModulesLink(artifactPaths.nodeModulesDir);
  await ensureHelperTempProject(artifactPaths.tempDir, bundledSkill.helperProject);

  const targetDirectory = join(artifactPaths.skillsDir, bundledSkill.name);
  await rm(targetDirectory, { recursive: true, force: true });
  await cp(bundledSkill.directory, targetDirectory, { recursive: true, force: true });

  const installedMetadata = await readInstalledSkill(targetDirectory, resolvedArtifactDir);
  if (!installedMetadata) {
    throw new Error(`Installed skill is missing a valid SKILL.md: ${targetDirectory}`);
  }

  return {
    ...installedMetadata,
    sourceDirectory: bundledSkill.directory,
    sourcePath: bundledSkill.path,
  };
}

export async function deleteSkill(
  skillName: string,
  artifactDir: string
): Promise<DeleteSkillResult> {
  const resolvedArtifactDir = resolve(artifactDir);
  const artifactPaths = getArtifactPaths(resolvedArtifactDir);
  const targetDirectory = join(artifactPaths.skillsDir, skillName);
  const installedMetadata = await readInstalledSkill(targetDirectory, resolvedArtifactDir);

  if (!installedMetadata) {
    throw new Error(`Installed skill "${skillName}" not found in artifact`);
  }

  await rm(targetDirectory, { recursive: true, force: false });

  return {
    ...installedMetadata,
    deleted: true,
  };
}

export async function listInstalledSkills(artifactDir: string): Promise<InstalledSkillEntry[]> {
  const resolvedArtifactDir = resolve(artifactDir);
  const artifactPaths = getArtifactPaths(resolvedArtifactDir);

  if (!(await pathExists(artifactPaths.skillsDir))) {
    return [];
  }

  const entries = await readdir(artifactPaths.skillsDir, { withFileTypes: true });
  const installedSkills: InstalledSkillEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDirectory = join(artifactPaths.skillsDir, entry.name);
    const installedSkill = await readInstalledSkill(skillDirectory, resolvedArtifactDir);
    if (!installedSkill) {
      continue;
    }

    installedSkills.push(installedSkill);
  }

  installedSkills.sort((left, right) => left.name.localeCompare(right.name));
  return installedSkills;
}

export async function readBundledSkillMetadata(skillName: string): Promise<SkillRegistryEntry> {
  const bundledSkill = await getBundledSkill(skillName);
  return {
    name: bundledSkill.name,
    description: bundledSkill.description,
    path: bundledSkill.path,
    ...(bundledSkill.helperProject ? { helperProject: bundledSkill.helperProject } : {}),
  };
}

function getArtifactPaths(artifactDir: string): {
  maxDir: string;
  skillsDir: string;
  tempDir: string;
  nodeModulesDir: string;
} {
  const maxDir = join(artifactDir, MAX_DIR_NAME);
  return {
    maxDir,
    skillsDir: join(maxDir, INSTALLED_SKILLS_DIR_NAME),
    tempDir: join(maxDir, TEMP_DIR_NAME),
    nodeModulesDir: join(maxDir, 'node_modules'),
  };
}

async function ensureArtifactNodeModulesLink(nodeModulesDir: string): Promise<void> {
  if (!(await pathExists(packageNodeModulesDir))) {
    throw new Error(`Bundled skill runtime dependencies are missing: ${packageNodeModulesDir}`);
  }

  if (await pathEntryExists(nodeModulesDir)) {
    const [existingRealPath, packageRealPath] = await Promise.all([
      realpath(nodeModulesDir).catch(() => undefined),
      realpath(packageNodeModulesDir),
    ]);
    if (existingRealPath === packageRealPath) {
      return;
    }

    await rm(nodeModulesDir, { recursive: true, force: true });
  }

  await symlink(
    packageNodeModulesDir,
    nodeModulesDir,
    process.platform === 'win32' ? 'junction' : 'dir'
  );
}

async function getBundledSkill(skillName: string): Promise<BundledSkillEntry> {
  const bundledSkills = await listBundledSkills();
  const skill = bundledSkills.find((entry) => entry.name === skillName);

  if (!skill) {
    const availableSkills = bundledSkills.map((entry) => entry.name).join(', ') || '[none]';
    throw new Error(`Unknown bundled skill "${skillName}". Available skills: ${availableSkills}`);
  }

  if (!(await pathExists(skill.path))) {
    throw new Error(`Bundled skill is missing SKILL.md: ${skill.path}`);
  }

  return skill;
}

async function readInstalledSkill(
  skillDirectory: string,
  artifactDir: string
): Promise<InstalledSkillEntry | undefined> {
  const skillPath = join(skillDirectory, 'SKILL.md');
  if (!(await pathExists(skillPath))) {
    return undefined;
  }

  const metadata = await readSkillMetadata(skillPath);
  const artifactPaths = getArtifactPaths(artifactDir);

  return {
    ...metadata,
    path: skillPath,
    artifactDir,
    maxDir: artifactPaths.maxDir,
    skillsDir: artifactPaths.skillsDir,
    tempDir: artifactPaths.tempDir,
    directory: skillDirectory,
    ...(await readInstalledSkillHelperProject(skillDirectory)),
  };
}

async function readBundledRegistry(): Promise<RegistryFileEntry[]> {
  const raw = await readFile(bundledRegistryPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Bundled skill registry must be an array: ${bundledRegistryPath}`);
  }

  const registry: RegistryFileEntry[] = [];
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.name !== 'string' ||
      typeof entry.description !== 'string' ||
      !isValidHelperProjectConfig(entry.helperProject)
    ) {
      throw new Error(`Bundled skill registry contains an invalid entry: ${bundledRegistryPath}`);
    }

    registry.push({
      name: entry.name,
      description: entry.description,
      ...(entry.helperProject ? { helperProject: entry.helperProject } : {}),
    });
  }

  registry.sort((left, right) => left.name.localeCompare(right.name));
  return registry;
}

async function readSkillMetadata(skillFilePath: string): Promise<{
  name: string;
  description: string;
}> {
  const raw = await readFile(skillFilePath, 'utf-8');
  const frontmatterMatch = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) {
    throw new Error(`Skill file is missing YAML frontmatter: ${skillFilePath}`);
  }

  const frontmatterBody = frontmatterMatch[1] ?? '';
  const values = parseFrontmatter(frontmatterBody);
  const name = values.name?.trim() ?? '';
  const description = values.description?.trim() ?? '';

  if (!name || !description) {
    throw new Error(`Skill frontmatter must include name and description: ${skillFilePath}`);
  }

  return { name, description };
}

function parseFrontmatter(frontmatterBody: string): Record<string, string> {
  const values: Record<string, string> = {};
  let pendingKey: string | undefined;
  let pendingLines: string[] = [];

  const flushPending = (): void => {
    if (!pendingKey) {
      return;
    }

    values[pendingKey] = pendingLines.join('\n').trim();
    pendingKey = undefined;
    pendingLines = [];
  };

  for (const rawLine of frontmatterBody.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const scalarMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (scalarMatch && !rawLine.startsWith('  ')) {
      flushPending();
      const key = scalarMatch[1];
      const rawValue = scalarMatch[2];

      if (!key || rawValue === undefined) {
        continue;
      }

      if (rawValue === '|' || rawValue === '>') {
        pendingKey = key;
        pendingLines = [];
        continue;
      }

      values[key] = normalizeFrontmatterValue(rawValue);
      continue;
    }

    if (pendingKey && rawLine.startsWith('  ')) {
      pendingLines.push(rawLine.slice(2));
    }
  }

  flushPending();
  return values;
}

function normalizeFrontmatterValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readInstalledSkillHelperProject(
  skillDirectory: string
): Promise<Pick<InstalledSkillEntry, 'helperProject'>> {
  const skillName = skillDirectory.split(/[/\\]/).pop();
  if (!skillName) {
    return {};
  }

  const bundledSkill = (await listBundledSkills()).find((entry) => entry.name === skillName);
  if (!bundledSkill?.helperProject) {
    return {};
  }

  return { helperProject: bundledSkill.helperProject };
}

function isValidHelperProjectConfig(value: unknown): value is SkillHelperProjectConfig | undefined {
  if (value === undefined) {
    return true;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SkillHelperProjectConfig>;
  return candidate.runtime === 'typescript' && candidate.package === '@ank1015/llm-agents';
}

async function ensureHelperTempProject(
  tempDir: string,
  helperProject?: SkillHelperProjectConfig
): Promise<void> {
  if (!helperProject) {
    return;
  }

  await mkdir(tempDir, { recursive: true });

  const scriptsDir = join(tempDir, TEMP_SCRIPTS_DIR_NAME);
  await mkdir(scriptsDir, { recursive: true });

  await ensureTempPackageJson(tempDir);
  await ensureTempTsconfig(tempDir);
  await ensureTempNodeModuleLinks(tempDir);
}

async function ensureTempPackageJson(tempDir: string): Promise<void> {
  const packageJsonPath = join(tempDir, PACKAGE_JSON_FILENAME);
  const packageVersion = await readCurrentPackageVersion();
  const tsxVersion = await readCurrentTsxVersion();

  let current: Record<string, unknown> = {};
  if (await pathExists(packageJsonPath)) {
    try {
      current = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const dependencies = normalizeObjectRecord(current.dependencies);
  const devDependencies = normalizeObjectRecord(current.devDependencies);

  dependencies['@ank1015/llm-agents'] = packageVersion;
  devDependencies.tsx = tsxVersion;

  const nextPackageJson = {
    name: typeof current.name === 'string' ? current.name : 'max-temp',
    private: true,
    type: 'module',
    dependencies,
    devDependencies,
  };

  await writeFile(packageJsonPath, `${JSON.stringify(nextPackageJson, null, 2)}\n`, 'utf-8');
}

async function ensureTempTsconfig(tempDir: string): Promise<void> {
  const tsconfigPath = join(tempDir, 'tsconfig.json');
  if (await pathExists(tsconfigPath)) {
    return;
  }

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ['node'],
    },
    include: ['scripts/**/*.ts'],
  };

  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, 'utf-8');
}

async function ensureTempNodeModuleLinks(tempDir: string): Promise<void> {
  const nodeModulesDir = join(tempDir, 'node_modules');
  const scopeDir = join(nodeModulesDir, '@ank1015');
  const binDir = join(nodeModulesDir, '.bin');
  await mkdir(scopeDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  await ensureSymlink(join(scopeDir, 'llm-agents'), packageRoot, 'dir');

  const tsxPackageDir = join(packageNodeModulesDir, 'tsx');
  if (!(await pathExists(tsxPackageDir))) {
    throw new Error(`tsx runtime is missing from the package dependencies: ${tsxPackageDir}`);
  }
  await ensureSymlink(join(nodeModulesDir, 'tsx'), tsxPackageDir, 'dir');

  for (const binaryName of ['tsx', 'tsx.cmd', 'tsx.ps1']) {
    const source = join(packageNodeModulesDir, '.bin', binaryName);
    if (!(await pathExists(source))) {
      continue;
    }
    await ensureSymlink(join(binDir, binaryName), source, 'file');
  }
}

async function ensureSymlink(
  linkPath: string,
  targetPath: string,
  type: 'dir' | 'file'
): Promise<void> {
  if (await pathEntryExists(linkPath)) {
    const [existingRealPath, targetRealPath] = await Promise.all([
      realpath(linkPath).catch(() => undefined),
      realpath(targetPath),
    ]);

    if (existingRealPath === targetRealPath) {
      return;
    }

    await rm(linkPath, { recursive: true, force: true });
  }

  await symlink(
    targetPath,
    linkPath,
    process.platform === 'win32' && type === 'dir' ? 'junction' : type
  );
}

function normalizeObjectRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === 'string') {
      record[key] = rawValue;
    }
  }
  return record;
}

async function readCurrentPackageVersion(): Promise<string> {
  const packageJsonPath = join(packageRoot, PACKAGE_JSON_FILENAME);
  const parsed = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as { version?: string };
  return parsed.version ?? '0.0.4';
}

async function readCurrentTsxVersion(): Promise<string> {
  const packageJsonPath = join(packageRoot, PACKAGE_JSON_FILENAME);
  const parsed = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  return parsed.devDependencies?.tsx ?? parsed.dependencies?.tsx ?? '^4.19.0';
}

async function pathEntryExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
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
