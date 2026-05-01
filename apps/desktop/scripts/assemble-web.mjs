#!/usr/bin/env node

import { existsSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const repoRoot = resolve(packageRoot, '../..');
const webAppRoot = resolve(repoRoot, 'apps/web');
const standaloneSource = resolve(webAppRoot, '.next/standalone');
const staticSource = resolve(webAppRoot, '.next/static');
const publicSource = resolve(webAppRoot, 'public');
const webVendorRoot = resolve(packageRoot, 'vendor/web');
const standaloneTarget = resolve(webVendorRoot, 'standalone');
const standaloneAppRoot = resolve(standaloneTarget, 'apps/web');
const standaloneNodeModules = resolve(standaloneTarget, 'node_modules');
const workspacePnpmStore = resolve(repoRoot, 'node_modules/.pnpm');

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${label}: ${path}. Run pnpm --filter @ank1015/llm-web-app build first.`
    );
  }
}

async function findTopLevelPackages(nodeModulesPath) {
  const entries = await readdir(nodeModulesPath, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name === '.pnpm') {
      continue;
    }

    if (entry.name.startsWith('@')) {
      const scopePath = join(nodeModulesPath, entry.name);
      const scopedEntries = await readdir(scopePath, { withFileTypes: true });

      for (const scopedEntry of scopedEntries) {
        if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) {
          packages.push(`${entry.name}/${scopedEntry.name}`);
        }
      }

      continue;
    }

    packages.push(entry.name);
  }

  return packages;
}

async function findPnpmPackageSource(packageName) {
  const pnpmPath = join(standaloneNodeModules, '.pnpm');
  const pnpmEntries = await readdir(pnpmPath, { withFileTypes: true });
  const packagePathParts = packageName.split('/');

  for (const entry of pnpmEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidate = join(pnpmPath, entry.name, 'node_modules', ...packagePathParts);

    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return undefined;
}

async function hydrateTopLevelPnpmPackages() {
  const packageNames = await findTopLevelPackages(standaloneNodeModules);

  for (const packageName of packageNames) {
    const target = join(standaloneNodeModules, ...packageName.split('/'));
    const targetStat = await lstat(target);
    const source =
      (await findPnpmPackageSource(packageName)) ??
      (targetStat.isSymbolicLink() ? await realpath(target) : undefined);

    if (!source) {
      continue;
    }

    if (targetStat.isSymbolicLink()) {
      await unlink(target);
    } else {
      await rm(target, { recursive: true, force: true });
    }

    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
}

async function replaceRemainingTopLevelSymlinks() {
  const packageNames = await findTopLevelPackages(standaloneNodeModules);

  for (const packageName of packageNames) {
    const target = join(standaloneNodeModules, ...packageName.split('/'));
    const targetStat = await lstat(target);

    if (!targetStat.isSymbolicLink()) {
      continue;
    }

    const source = await realpath(target);
    await unlink(target);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
}

async function replaceSymlinksInDirectory(directory) {
  if (!existsSync(directory)) {
    return 0;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  let replacedCount = 0;

  for (const entry of entries) {
    const target = join(directory, entry.name);
    const targetStat = await lstat(target);

    if (targetStat.isSymbolicLink()) {
      const source = await resolveSymlinkSource(target);

      if (!source) {
        await unlink(target);
        replacedCount += 1;
        continue;
      }

      await unlink(target);
      await cp(source, target, { recursive: true });
      replacedCount += 1;
      continue;
    }

    if (targetStat.isDirectory()) {
      replacedCount += await replaceSymlinksInDirectory(target);
    }
  }

  return replacedCount;
}

async function resolveSymlinkSource(target) {
  try {
    return await realpath(target);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  const linkTarget = await readlink(target);
  const absoluteLinkTarget = resolve(dirname(target), linkTarget);
  const packageSource = getWorkspacePackageSource(absoluteLinkTarget);

  if (packageSource && existsSync(packageSource)) {
    return packageSource;
  }

  return undefined;
}

function getWorkspacePackageSource(path) {
  const pnpmSegment = `${standaloneNodeModules}/.pnpm/`;
  const pnpmIndex = path.indexOf(pnpmSegment);

  if (pnpmIndex === -1) {
    return undefined;
  }

  const relativePackagePath = path.slice(pnpmIndex + pnpmSegment.length);

  return resolve(workspacePnpmStore, relativePackagePath);
}

function isMissingPathError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function replaceSymlinksUntilStable(directory) {
  let replacedCount = 0;

  do {
    replacedCount = await replaceSymlinksInDirectory(directory);
  } while (replacedCount > 0);
}

assertExists(standaloneSource, 'Next standalone build');
assertExists(staticSource, 'Next static assets');

await rm(webVendorRoot, { recursive: true, force: true });
await mkdir(standaloneAppRoot, { recursive: true });
await cp(standaloneSource, standaloneTarget, { recursive: true });
await hydrateTopLevelPnpmPackages();
await replaceRemainingTopLevelSymlinks();
await replaceSymlinksUntilStable(standaloneNodeModules);
await replaceSymlinksUntilStable(resolve(standaloneAppRoot, 'node_modules'));
await replaceSymlinksUntilStable(resolve(standaloneAppRoot, '.next/node_modules'));
await cp(staticSource, resolve(standaloneAppRoot, '.next/static'), { recursive: true });

if (existsSync(publicSource)) {
  await cp(publicSource, resolve(standaloneAppRoot, 'public'), { recursive: true });
}

await writeFile(
  resolve(webVendorRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      source: {
        static: 'apps/web/.next/static',
        standalone: 'apps/web/.next/standalone',
      },
    },
    null,
    2
  )}\n`
);

const webEntry = resolve(standaloneAppRoot, 'server.js');
if (existsSync(webEntry)) {
  await chmod(webEntry, 0o755);
}
