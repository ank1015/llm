import { existsSync } from 'node:fs';
import { access, lstat, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_JSON_FILENAME = 'package.json';
const MAX_DIR_NAME = '.max';
const SKILLS_DIR_NAME = 'skills';
const TEMP_DIR_NAME = 'temp';
const TEMP_SCRIPTS_DIR_NAME = 'scripts';
const DEFAULT_AGENTS_VERSION = '0.0.7';
const DEFAULT_TSX_VERSION = '^4.19.0';
const currentFileDir = dirname(fileURLToPath(import.meta.url));

type PackageInstallInfo = {
  packageRoot: string;
  version: string;
  nodeModulesDir: string;
};

type TempWorkspaceLayout = {
  maxDir: string;
  skillsDir: string;
  tempDir: string;
  scriptsDir: string;
  nodeModulesDir: string;
  scopeDir: string;
  binDir: string;
};

let cachedAgentsPackageInfo: Promise<PackageInstallInfo> | null = null;
let cachedTsxPackageInfo: Promise<PackageInstallInfo> | null = null;

export async function ensureArtifactTempWorkspace(artifactDir: string): Promise<void> {
  const layout = createTempWorkspaceLayout(artifactDir);

  await mkdir(layout.maxDir, { recursive: true });
  await mkdir(layout.skillsDir, { recursive: true });
  await mkdir(layout.tempDir, { recursive: true });
  await mkdir(layout.scriptsDir, { recursive: true });

  await ensureTempPackageJson(layout.tempDir);
  await ensureTempTsconfig(layout.tempDir);
  await ensureTempNodeModules(layout);
}

function createTempWorkspaceLayout(artifactDir: string): TempWorkspaceLayout {
  const resolvedArtifactDir = resolve(artifactDir);
  const maxDir = join(resolvedArtifactDir, MAX_DIR_NAME);
  const tempDir = join(maxDir, TEMP_DIR_NAME);
  const nodeModulesDir = join(tempDir, 'node_modules');

  return {
    maxDir,
    skillsDir: join(maxDir, SKILLS_DIR_NAME),
    tempDir,
    scriptsDir: join(tempDir, TEMP_SCRIPTS_DIR_NAME),
    nodeModulesDir,
    scopeDir: join(nodeModulesDir, '@ank1015'),
    binDir: join(nodeModulesDir, '.bin'),
  };
}

async function ensureTempPackageJson(tempDir: string): Promise<void> {
  const [agentsPackage, tsxPackage] = await Promise.all([
    getAgentsPackageInfo(),
    getTsxPackageInfo(),
  ]);
  const packageJsonPath = join(tempDir, PACKAGE_JSON_FILENAME);

  let current: Record<string, unknown> = {};
  if (await pathExists(packageJsonPath)) {
    try {
      current = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const dependencies = normalizeObjectRecord(current['dependencies']);
  const devDependencies = normalizeObjectRecord(current['devDependencies']);

  dependencies['@ank1015/llm-agents'] = agentsPackage.version;
  devDependencies['tsx'] = tsxPackage.version;

  const nextPackageJson = {
    name: typeof current['name'] === 'string' ? current['name'] : 'max-temp',
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

async function ensureTempNodeModules(layout: TempWorkspaceLayout): Promise<void> {
  const [agentsPackage, tsxPackage] = await Promise.all([
    getAgentsPackageInfo(),
    getTsxPackageInfo(),
  ]);

  await mkdir(layout.scopeDir, { recursive: true });
  await mkdir(layout.binDir, { recursive: true });

  await ensureSymlink(join(layout.scopeDir, 'llm-agents'), agentsPackage.packageRoot, 'dir');
  await ensureSymlink(join(layout.nodeModulesDir, 'tsx'), tsxPackage.packageRoot, 'dir');

  for (const binaryName of ['tsx', 'tsx.cmd', 'tsx.ps1']) {
    const source = join(tsxPackage.nodeModulesDir, '.bin', binaryName);
    if (!(await pathExists(source))) {
      continue;
    }

    await ensureSymlink(join(layout.binDir, binaryName), source, 'file');
  }
}

async function getAgentsPackageInfo(): Promise<PackageInstallInfo> {
  cachedAgentsPackageInfo ??= resolveInstalledPackageInfo(
    '@ank1015/llm-agents',
    DEFAULT_AGENTS_VERSION
  );
  return cachedAgentsPackageInfo;
}

async function getTsxPackageInfo(): Promise<PackageInstallInfo> {
  cachedTsxPackageInfo ??= (async () => {
    const agentsPackage = await getAgentsPackageInfo();
    const agentsPackageJsonPath = join(agentsPackage.packageRoot, PACKAGE_JSON_FILENAME);
    const agentsPackageJson = JSON.parse(await readFile(agentsPackageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageRoot = join(agentsPackage.nodeModulesDir, 'tsx');

    return {
      packageRoot,
      version:
        agentsPackageJson.dependencies?.['tsx'] ??
        agentsPackageJson.devDependencies?.['tsx'] ??
        DEFAULT_TSX_VERSION,
      nodeModulesDir: resolvePackageNodeModulesDir(packageRoot),
    };
  })();
  return cachedTsxPackageInfo;
}

async function resolveInstalledPackageInfo(
  specifier: string,
  fallbackVersion: string
): Promise<PackageInstallInfo> {
  const packageRoot = await realpath(findDependencyPackageRoot(specifier, currentFileDir));
  const packageJsonPath = join(packageRoot, PACKAGE_JSON_FILENAME);
  const parsed = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as { version?: string };

  return {
    packageRoot,
    version: parsed.version ?? fallbackVersion,
    nodeModulesDir: resolvePackageNodeModulesDir(packageRoot),
  };
}

function findDependencyPackageRoot(specifier: string, startDir: string): string {
  const packageSegments = specifier.split('/');
  let dir = startDir;

  while (true) {
    const candidate = join(dir, 'node_modules', ...packageSegments);
    if (existsSync(join(candidate, PACKAGE_JSON_FILENAME))) {
      return candidate;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      throw new Error(`Unable to locate installed package "${specifier}" from ${startDir}`);
    }

    dir = parentDir;
  }
}

function resolvePackageNodeModulesDir(packageRoot: string): string {
  return findNearestNodeModulesDir(packageRoot) ?? join(packageRoot, 'node_modules');
}

function findNearestNodeModulesDir(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    if (basename(dir) === 'node_modules') {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      return null;
    }

    dir = parentDir;
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function pathEntryExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}
