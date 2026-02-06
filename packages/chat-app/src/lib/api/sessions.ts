import { createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

import type { SessionLocation } from '@ank1015/llm-sdk';
import type { FileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

export type SessionScope = {
  projectName: string;
  path: string;
};

const DEFAULT_PROJECT_NAME = 'default';

function resolveProjectName(value: string | null | undefined): string | undefined {
  const candidate = value?.trim() || process.env.LLM_PROJECT_NAME?.trim() || DEFAULT_PROJECT_NAME;

  if (
    candidate.length === 0 ||
    candidate === '.' ||
    candidate === '..' ||
    candidate.includes('/') ||
    candidate.includes('\\') ||
    candidate.includes('\0')
  ) {
    return undefined;
  }

  return candidate;
}

function normalizePath(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.replaceAll('\\', '/');
  if (normalized.startsWith('/') || normalized.includes('\0')) {
    return undefined;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return undefined;
  }

  return segments.join('/');
}

export function parseSessionScope(input: {
  projectName?: string | null;
  path?: string | null;
}): SessionScope | undefined {
  const projectName = resolveProjectName(input.projectName);
  const path = normalizePath(input.path);

  if (!projectName || path === undefined) {
    return undefined;
  }

  return { projectName, path };
}

export function toSessionLocation(scope: SessionScope, sessionId: string): SessionLocation {
  return {
    projectName: scope.projectName,
    path: scope.path,
    sessionId,
  };
}

export function createSessionsAdapter(): FileSessionsAdapter {
  const sessionsDir = process.env.LLM_SESSIONS_DIR;
  return createFileSessionsAdapter(sessionsDir);
}
