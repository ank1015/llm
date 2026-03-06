import { spawn } from 'child_process';
import { access, readFile, realpath } from 'fs/promises';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFileDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentFileDir, '../../../../../');
const sourceSkillsDir = resolve(repoRoot, 'packages/agents/skills');

const internalPackages = [
  {
    name: '@ank1015/llm-types',
    sourceDir: resolve(repoRoot, 'packages/types'),
  },
  {
    name: '@ank1015/llm-sdk',
    sourceDir: resolve(repoRoot, 'packages/sdk'),
  },
  {
    name: '@ank1015/llm-sdk-adapters',
    sourceDir: resolve(repoRoot, 'packages/sdk-adapters'),
  },
  {
    name: '@ank1015/llm-extension',
    sourceDir: resolve(repoRoot, 'packages/extension'),
  },
] as const;

const bundledSkillDependencies = {
  pptxgenjs: '^4.0.1',
  react: '^19.2.4',
  'react-dom': '^19.2.4',
  'react-icons': '^5.6.0',
  sharp: '^0.34.5',
  xlsx: '^0.18.5',
} as const;

const bundledSkillDevDependencies = {
  '@types/react': '^19.2.14',
  '@types/react-dom': '^19.2.3',
} as const;

export interface SetupSkillsResult {
  rootDir: string;
  skillsDir: string;
  scriptsDir: string;
  installedPackages: Record<string, string>;
  registryPath: string;
  skillsRegistry: SkillRegistryEntry[];
}

export interface SkillRegistryEntry {
  name: string;
  description: string;
  path: string;
}

export async function setupSkills(projectDir: string): Promise<SetupSkillsResult> {
  const rootDir = resolve(projectDir, 'max-skills');

  await mkdir(rootDir, { recursive: true });
  const rootDirRealPath = await realpath(rootDir);
  const skillsDir = join(rootDirRealPath, 'skills');
  const scriptsDir = join(rootDirRealPath, 'scripts');
  const installedPackages = await createInstalledPackageMap();
  await writeProjectFiles(rootDirRealPath, scriptsDir, installedPackages);
  await syncBundledSkills(skillsDir);
  await rm(join(rootDirRealPath, 'workspace'), { recursive: true, force: true });
  await rm(join(rootDirRealPath, 'src'), { recursive: true, force: true });
  await rm(join(rootDirRealPath, 'tmp'), { recursive: true, force: true });
  const { registryPath, skillsRegistry } = await writeSkillsRegistry(skillsDir);
  await installWorkspace(rootDirRealPath);

  return {
    rootDir: rootDirRealPath,
    skillsDir,
    scriptsDir,
    installedPackages,
    registryPath,
    skillsRegistry,
  };
}

async function writeProjectFiles(
  rootDir: string,
  scriptsDir: string,
  installedPackages: Record<string, string>
): Promise<void> {
  await mkdir(scriptsDir, { recursive: true });

  const packageJson = {
    name: 'max-skills',
    version: '0.0.1',
    private: true,
    type: 'module',
    packageManager: 'pnpm@9.15.0',
    scripts: {
      typecheck: 'tsc --noEmit',
      script: 'tsx',
    },
    dependencies: installedPackages,
    devDependencies: {
      '@types/node': '^25.3.2',
      ...bundledSkillDevDependencies,
      tsx: '^4.19.0',
      typescript: '^5.7.0',
    },
    engines: {
      node: '>=20.0.0',
    },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      noUncheckedIndexedAccess: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      exactOptionalPropertyTypes: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      skipLibCheck: true,
      types: ['node'],
      noEmit: true,
    },
    include: ['scripts/**/*.ts'],
    exclude: ['node_modules', 'dist'],
  };

  const readme = `# max-skills

Generated TypeScript project for Max skills and artifact-scoped helper scripts.

## Layout

- \`skills/\`: bundled skills copied from \`packages/agents/skills/\` plus any project-specific skills you add later
- \`scripts/\`: helper scripts grouped by artifact, for example \`scripts/product/\`

## Commands

- \`pnpm typecheck\`: type-check scripts under \`scripts/\`
- \`pnpm exec tsx <file>\`: run any TypeScript file inside this project

## Notes

- Internal \`@ank1015/*\` packages are installed from npm using the versions configured when this workspace was generated.
- The generated workspace uses pnpm, TypeScript, and ESM. Prefer \`.ts\` scripts run with \`pnpm exec tsx\`.
- Bundled skill npm packages such as \`pptxgenjs\`, \`react\`, \`react-dom\`, \`react-icons\`, \`sharp\`, and \`xlsx\` are installed automatically.
- For each artifact, helper scripts and intermediate files should live under \`scripts/<artifact-name>/\`.
- Final user-facing outputs should stay in the artifact directory unless the user asks for a different location.
- If you publish a newer package version and want this workspace to use it, rerun the setup.
`;

  const gitignore = `node_modules
dist
scripts/*/tmp
`;

  await writeManagedFile(
    join(rootDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
  await writeManagedFile(join(rootDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
  await writeManagedFile(join(rootDir, 'README.md'), readme);
  await writeManagedFile(join(rootDir, '.gitignore'), gitignore);
}

async function syncBundledSkills(skillsDir: string): Promise<void> {
  await mkdir(skillsDir, { recursive: true });

  if (!(await pathExists(sourceSkillsDir))) {
    return;
  }

  const entries = await readdir(sourceSkillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceSkillDir = join(sourceSkillsDir, entry.name);
    const targetSkillDir = join(skillsDir, entry.name);

    await rm(targetSkillDir, { recursive: true, force: true });
    await cp(sourceSkillDir, targetSkillDir, { recursive: true, force: true });
  }
}

async function writeSkillsRegistry(
  skillsDir: string
): Promise<{ registryPath: string; skillsRegistry: SkillRegistryEntry[] }> {
  const skillsRegistry = await buildSkillsRegistry(skillsDir);
  const registryPath = join(skillsDir, 'registry.json');
  await writeManagedFile(registryPath, `${JSON.stringify(skillsRegistry, null, 2)}\n`);

  return {
    registryPath,
    skillsRegistry,
  };
}

async function installWorkspace(rootDir: string): Promise<void> {
  const startedAt = Date.now();
  process.stderr.write(`[skills] installing workspace dependencies in ${rootDir}\n`);
  await runCommandWithOptions(getPnpmCommand(), ['install'], rootDir, { streamOutput: true });
  const elapsedMs = Date.now() - startedAt;
  process.stderr.write(`[skills] finished pnpm install in ${elapsedMs}ms\n`);
}

async function writeManagedFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function getPnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function createInstalledPackageMap(): Promise<Record<string, string>> {
  const installedPackages: Record<string, string> = {
    ...bundledSkillDependencies,
  };

  for (const pkg of internalPackages) {
    installedPackages[pkg.name] = await readPackageVersion(pkg.sourceDir);
  }

  return installedPackages;
}

async function readPackageVersion(packageDir: string): Promise<string> {
  const packageJsonPath = join(packageDir, 'package.json');
  const raw = await readFile(packageJsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as { version?: string };

  if (!parsed.version) {
    throw new Error(`Package version not found in ${packageJsonPath}`);
  }

  return parsed.version;
}

async function buildSkillsRegistry(skillsDir: string): Promise<SkillRegistryEntry[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skillsRegistry: SkillRegistryEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillFilePath = join(skillsDir, entry.name, 'SKILL.md');
    if (!(await pathExists(skillFilePath))) {
      continue;
    }

    const { name, description } = await readSkillMetadata(skillFilePath);
    skillsRegistry.push({
      name,
      description,
      path: skillFilePath,
    });
  }

  skillsRegistry.sort((left, right) => left.name.localeCompare(right.name));
  return skillsRegistry;
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
  let name = '';
  let description = '';

  for (const line of frontmatterBody.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = normalizeFrontmatterValue(line.slice(separatorIndex + 1).trim());

    if (key === 'name') {
      name = value;
    } else if (key === 'description') {
      description = value;
    }
  }

  if (!name || !description) {
    throw new Error(`Skill frontmatter must include name and description: ${skillFilePath}`);
  }

  return { name, description };
}

function normalizeFrontmatterValue(value: string): string {
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function runCommandWithOptions(
  command: string,
  args: string[],
  cwd: string,
  options?: { streamOutput?: boolean }
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      if (options?.streamOutput) {
        process.stderr.write(text);
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      if (options?.streamOutput) {
        process.stderr.write(text);
      }
    });

    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const location = relative(process.cwd(), cwd) || cwd;
      rejectPromise(
        new Error(`Command failed in ${location}: ${command} ${args.join(' ')}\n${output.trim()}`)
      );
    });
  });
}
