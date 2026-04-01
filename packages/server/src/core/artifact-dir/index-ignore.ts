import { basename } from 'node:path';

import type { ArtifactExplorerEntryType } from '../../types/index.js';

export type IgnoreRule = {
  basePath: string;
  negate: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  hasSlash: boolean;
  regex: RegExp;
};

const DEFAULT_ARTIFACT_INDEX_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  '.hg/',
  '.svn/',
  '.idea/',
  '.vscode/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.turbo/',
  '.cache/',
  '.parcel-cache/',
  '.pnpm-store/',
  '.yarn/',
  '.expo/',
  '.gradle/',
  '.kotlin/',
  '.venv/',
  'venv/',
  '__pycache__/',
  '.pytest_cache/',
  '.mypy_cache/',
  '.ruff_cache/',
  '.tox/',
  '.serverless/',
  '.aws-sam/',
  '.terraform/',
  '.angular/',
  '.output/',
  '.vercel/',
  '.max/',
  '.agents/',
  'dist/',
  'build/',
  'out/',
  'coverage/',
  'tmp/',
  'temp/',
  '.tmp/',
  'DerivedData/',
  'Pods/',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '*.tsbuildinfo',
  '*.swp',
  '*.swo',
  '*.tmp',
  '*.temp',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  'pnpm-debug.log*',
  '.env',
  '.env.local',
  '.env.*.local',
] as const;

const DEFAULT_ARTIFACT_INDEX_IGNORE_RULES = compileIgnoreRules(
  DEFAULT_ARTIFACT_INDEX_IGNORE_PATTERNS,
  ''
);

export function getDefaultArtifactIndexIgnoreRules(): readonly IgnoreRule[] {
  return DEFAULT_ARTIFACT_INDEX_IGNORE_RULES;
}

export function parseGitIgnoreRules(content: string, basePath: string): IgnoreRule[] {
  return compileIgnoreRules(content.split(/\r?\n/u), basePath);
}

export function shouldIgnoreArtifactIndexPath(
  relativePath: string,
  type: ArtifactExplorerEntryType,
  rules: readonly IgnoreRule[]
): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (!matchesIgnoreRule(rule, relativePath, type)) {
      continue;
    }

    ignored = !rule.negate;
  }

  return ignored;
}

function compileIgnoreRules(patterns: readonly string[], basePath: string): IgnoreRule[] {
  const normalizedBasePath = normalizeIgnorePath(basePath);

  return patterns.flatMap((rawPattern) => {
    const parsed = parseIgnorePattern(rawPattern);
    if (!parsed) {
      return [];
    }

    const normalizedPattern = normalizeIgnorePattern(parsed.pattern);
    if (!normalizedPattern || normalizedPattern === '.') {
      return [];
    }

    const anchored = normalizedPattern.startsWith('/');
    const pattern = anchored ? normalizedPattern.slice(1) : normalizedPattern;
    if (!pattern) {
      return [];
    }

    return [
      {
        basePath: normalizedBasePath,
        negate: parsed.negate,
        directoryOnly: parsed.directoryOnly,
        anchored,
        hasSlash: pattern.includes('/'),
        regex: new RegExp(`^${globToRegexSource(pattern)}$`, 'u'),
      },
    ];
  });
}

function parseIgnorePattern(
  rawPattern: string
): { pattern: string; negate: boolean; directoryOnly: boolean } | null {
  const line = rawPattern.replace(/\r$/u, '');
  if (!line.trim()) {
    return null;
  }

  let pattern = line.trim();
  if (pattern.startsWith('#')) {
    return null;
  }

  let negate = false;
  if (pattern.startsWith('\\#') || pattern.startsWith('\\!')) {
    pattern = pattern.slice(1);
  } else if (pattern.startsWith('!')) {
    negate = true;
    pattern = pattern.slice(1).trim();
  }

  if (!pattern) {
    return null;
  }

  const directoryOnly = pattern.endsWith('/');
  if (directoryOnly) {
    pattern = pattern.slice(0, -1);
  }

  if (!pattern) {
    return null;
  }

  return {
    pattern,
    negate,
    directoryOnly,
  };
}

function normalizeIgnorePattern(pattern: string): string {
  return pattern.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

function normalizeIgnorePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function matchesIgnoreRule(
  rule: IgnoreRule,
  relativePath: string,
  type: ArtifactExplorerEntryType
): boolean {
  if (rule.directoryOnly && type !== 'directory') {
    return false;
  }

  const normalizedPath = normalizeIgnorePath(relativePath);
  if (!normalizedPath) {
    return false;
  }

  const pathWithinBase = getPathWithinBase(normalizedPath, rule.basePath);
  if (pathWithinBase === null || pathWithinBase.length === 0) {
    return false;
  }

  if (rule.hasSlash || rule.anchored) {
    return rule.regex.test(pathWithinBase);
  }

  return rule.regex.test(basename(pathWithinBase));
}

function getPathWithinBase(relativePath: string, basePath: string): string | null {
  if (!basePath) {
    return relativePath;
  }

  if (relativePath === basePath) {
    return '';
  }

  const prefix = `${basePath}/`;
  if (!relativePath.startsWith(prefix)) {
    return null;
  }

  return relativePath.slice(prefix.length);
}

function globToRegexSource(pattern: string): string {
  let source = '';

  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.startsWith('**/', index)) {
      source += '(?:[^/]+/)*';
      index += 2;
      continue;
    }

    if (pattern.startsWith('/**', index)) {
      source += '(?:/.*)?';
      index += 2;
      continue;
    }

    if (pattern.startsWith('**', index)) {
      source += '.*';
      index += 1;
      continue;
    }

    const char = pattern[index];
    if (!char) {
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegexCharacter(char);
  }

  return source;
}

function escapeRegexCharacter(char: string): string {
  return /[\\^$.*+?()[\]{}|]/u.test(char) ? `\\${char}` : char;
}
