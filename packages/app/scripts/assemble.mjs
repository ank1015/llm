#!/usr/bin/env node

import { chmod, cp, lstat, mkdir, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
const cliEntry = resolve(packageRoot, 'dist/cli.js');

function assertExists(path, label) {
  if (!existsSync(path)) {
    console.error(`Missing ${label}: ${path}`);
    console.error('Run pnpm release:app:build so the server and web production builds exist.');
    process.exit(1);
  }
}

assertExists(standaloneSource, 'Next standalone build');
assertExists(staticSource, 'Next static assets');

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
    const source = (await findPnpmPackageSource(packageName)) ?? (
      targetStat.isSymbolicLink() ? await realpath(target) : undefined
    );

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
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const target = join(directory, entry.name);
    const targetStat = await lstat(target);

    if (targetStat.isSymbolicLink()) {
      const source = await realpath(target);
      await unlink(target);
      await cp(source, target, { recursive: true });
      continue;
    }

    if (targetStat.isDirectory()) {
      await replaceSymlinksInDirectory(target);
    }
  }
}

await rm(webVendorRoot, { recursive: true, force: true });
await mkdir(standaloneAppRoot, { recursive: true });
await cp(standaloneSource, standaloneTarget, { recursive: true });
await hydrateTopLevelPnpmPackages();
await replaceRemainingTopLevelSymlinks();
await replaceSymlinksInDirectory(resolve(standaloneAppRoot, '.next/node_modules'));
await cp(staticSource, resolve(standaloneAppRoot, '.next/static'), {
  recursive: true,
});

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

if (existsSync(cliEntry)) {
  await chmod(cliEntry, 0o755);
}
