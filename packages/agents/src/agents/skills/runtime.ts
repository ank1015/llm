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
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_JSON_FILENAME = 'package.json';
const currentFileDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = findPackageRoot(currentFileDir);
let monorepoRoot: string | null | undefined;
const bundledSkillsDir = join(packageRoot, 'skills');
const bundledRegistryPath = join(bundledSkillsDir, 'registry.json');
const packageNodeModulesDir = resolvePackageNodeModulesDir(packageRoot);

export const MAX_DIR_NAME = '.max';
export const INSTALLED_SKILLS_DIR_NAME = 'skills';
export const TEMP_DIR_NAME = 'temp';
export const SKILL_TESTER_DIR_NAME = '.skill-tester';
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

export interface WorkspaceInstalledSkillEntry extends SkillRegistryEntry {
  stateDir: string;
  skillsDir: string;
  tempDir: string;
  directory: string;
  helperProject?: SkillHelperProjectConfig;
}

export interface WorkspaceAddSkillResult extends WorkspaceInstalledSkillEntry {
  sourceDirectory: string;
  sourcePath: string;
}

export interface SkillWorkspaceLayout {
  kind: 'artifact' | 'tester';
  rootDir: string;
  stateDir: string;
  skillsDir: string;
  tempDir: string;
  nodeModulesDir: string;
}

interface RegistryFileEntry {
  name: string;
  description: string;
  helperProject?: SkillHelperProjectConfig;
}

export function getAgentsPackageRoot(): string {
  return packageRoot;
}

export function getAgentsMonorepoRoot(): string {
  monorepoRoot ??= findMonorepoRoot(packageRoot);
  if (!monorepoRoot) {
    throw new Error('The skill tester is only available from an @ank1015/llm monorepo checkout.');
  }

  return monorepoRoot;
}

export function createArtifactSkillWorkspaceLayout(artifactDir: string): SkillWorkspaceLayout {
  const resolvedArtifactDir = resolve(artifactDir);
  const stateDir = join(resolvedArtifactDir, MAX_DIR_NAME);

  return {
    kind: 'artifact',
    rootDir: resolvedArtifactDir,
    stateDir,
    skillsDir: join(stateDir, INSTALLED_SKILLS_DIR_NAME),
    tempDir: join(stateDir, TEMP_DIR_NAME),
    nodeModulesDir: join(stateDir, 'node_modules'),
  };
}

export function createSkillTesterWorkspaceLayout(workspaceRoot?: string): SkillWorkspaceLayout {
  const resolvedWorkspaceRoot = resolve(workspaceRoot ?? join(packageRoot, SKILL_TESTER_DIR_NAME));

  return {
    kind: 'tester',
    rootDir: resolvedWorkspaceRoot,
    stateDir: resolvedWorkspaceRoot,
    skillsDir: join(resolvedWorkspaceRoot, INSTALLED_SKILLS_DIR_NAME),
    tempDir: join(resolvedWorkspaceRoot, TEMP_DIR_NAME),
    nodeModulesDir: join(resolvedWorkspaceRoot, 'node_modules'),
  };
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

export async function addSkillToLayout(
  skillName: string,
  layout: SkillWorkspaceLayout
): Promise<WorkspaceAddSkillResult> {
  const bundledSkill = await getBundledSkill(skillName);

  await mkdir(layout.rootDir, { recursive: true });
  await mkdir(layout.stateDir, { recursive: true });
  await mkdir(layout.skillsDir, { recursive: true });
  await mkdir(layout.tempDir, { recursive: true });
  await ensureStateNodeModulesLink(layout.nodeModulesDir);
  await ensureHelperTempProject(layout, bundledSkill.helperProject);

  const targetDirectory = join(layout.skillsDir, bundledSkill.name);
  await rm(targetDirectory, { recursive: true, force: true });
  await cp(bundledSkill.directory, targetDirectory, { recursive: true, force: true });

  const installedMetadata = await readInstalledSkillInLayout(targetDirectory, layout);
  if (!installedMetadata) {
    throw new Error(`Installed skill is missing a valid SKILL.md: ${targetDirectory}`);
  }

  return {
    ...installedMetadata,
    sourceDirectory: bundledSkill.directory,
    sourcePath: bundledSkill.path,
  };
}

export async function deleteSkillFromLayout(
  skillName: string,
  layout: SkillWorkspaceLayout
): Promise<WorkspaceInstalledSkillEntry> {
  const targetDirectory = join(layout.skillsDir, skillName);
  const installedMetadata = await readInstalledSkillInLayout(targetDirectory, layout);

  if (!installedMetadata) {
    throw new Error(`Installed skill "${skillName}" not found in workspace`);
  }

  await rm(targetDirectory, { recursive: true, force: false });
  return installedMetadata;
}

export async function listInstalledSkillsInLayout(
  layout: SkillWorkspaceLayout
): Promise<WorkspaceInstalledSkillEntry[]> {
  if (!(await pathExists(layout.skillsDir))) {
    return [];
  }

  const entries = await readdir(layout.skillsDir, { withFileTypes: true });
  const installedSkills: WorkspaceInstalledSkillEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDirectory = join(layout.skillsDir, entry.name);
    const installedSkill = await readInstalledSkillInLayout(skillDirectory, layout);
    if (!installedSkill) {
      continue;
    }

    installedSkills.push(installedSkill);
  }

  installedSkills.sort((left, right) => left.name.localeCompare(right.name));
  return installedSkills;
}

export async function pruneInstalledSkillsInLayout(
  layout: SkillWorkspaceLayout,
  skillNamesToKeep: Iterable<string>
): Promise<void> {
  const keepSet = new Set(skillNamesToKeep);
  const installedSkills = await listInstalledSkillsInLayout(layout);

  for (const skill of installedSkills) {
    if (keepSet.has(skill.name)) {
      continue;
    }

    await rm(skill.directory, { recursive: true, force: true });
  }
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

async function ensureStateNodeModulesLink(nodeModulesDir: string): Promise<void> {
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

async function readInstalledSkillInLayout(
  skillDirectory: string,
  layout: SkillWorkspaceLayout
): Promise<WorkspaceInstalledSkillEntry | undefined> {
  const skillPath = join(skillDirectory, 'SKILL.md');
  if (!(await pathExists(skillPath))) {
    return undefined;
  }

  const metadata = await readSkillMetadata(skillPath);

  return {
    ...metadata,
    path: skillPath,
    stateDir: layout.stateDir,
    skillsDir: layout.skillsDir,
    tempDir: layout.tempDir,
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
): Promise<Pick<WorkspaceInstalledSkillEntry, 'helperProject'>> {
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
  layout: SkillWorkspaceLayout,
  helperProject?: SkillHelperProjectConfig
): Promise<void> {
  if (!helperProject) {
    return;
  }

  await mkdir(layout.tempDir, { recursive: true });

  const scriptsDir = join(layout.tempDir, TEMP_SCRIPTS_DIR_NAME);
  await mkdir(scriptsDir, { recursive: true });

  await ensureTempPackageJson(layout);
  await ensureTempTsconfig(layout.tempDir);
  await ensureTempNodeModuleLinks(layout);
}

async function ensureTempPackageJson(layout: SkillWorkspaceLayout): Promise<void> {
  const packageJsonPath = join(layout.tempDir, PACKAGE_JSON_FILENAME);
  const packageDependency = await readAgentsPackageDependency(layout);
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

  dependencies['@ank1015/llm-agents'] = packageDependency;
  devDependencies.tsx = tsxVersion;

  const nextPackageJson = {
    name:
      typeof current.name === 'string'
        ? current.name
        : layout.kind === 'tester'
          ? 'llm-agents-skill-tester-temp'
          : 'max-temp',
    private: true,
    type: 'module',
    dependencies,
    devDependencies,
  };

  await writeFile(packageJsonPath, `${JSON.stringify(nextPackageJson, null, 2)}\n`, 'utf-8');
}

async function readAgentsPackageDependency(layout: SkillWorkspaceLayout): Promise<string> {
  if (layout.kind === 'tester') {
    return toFileDependencySpec(layout.tempDir, packageRoot);
  }

  return readCurrentPackageVersion();
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

async function ensureTempNodeModuleLinks(layout: SkillWorkspaceLayout): Promise<void> {
  const nodeModulesDir = join(layout.tempDir, 'node_modules');
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
  return parsed.version ?? '0.0.6';
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

function toFileDependencySpec(fromDir: string, toDir: string): string {
  const relativePath = relative(fromDir, toDir).replaceAll('\\', '/');
  return `file:${relativePath || '.'}`;
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

function resolvePackageNodeModulesDir(packageRootPath: string): string {
  return findNearestNodeModulesDir(packageRootPath) ?? join(packageRootPath, 'node_modules');
}

function findNearestNodeModulesDir(startDir: string): string | undefined {
  let dir = startDir;

  while (true) {
    if (basename(dir) === 'node_modules') {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return undefined;
    }

    dir = parentDir;
  }
}

function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return null;
    }

    dir = parentDir;
  }
}
