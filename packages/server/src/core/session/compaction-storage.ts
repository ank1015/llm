import { randomUUID } from 'node:crypto';
import { appendFile, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  SESSION_COMPACTION_FILE_SUFFIX,
  SESSION_COMPACTION_NODE_TYPES,
} from '../../types/index.js';
import { getConfig } from '../config.js';
import { ensureDir, pathExists } from '../storage/fs.js';

import type {
  CreateSessionCompactionNodeInput,
  SessionCompactionNode,
  SessionCompactionNodeType,
} from '../../types/index.js';

const SESSION_META_DIR_NAME = 'meta';

type PersistedSessionCompactionNode<
  T extends CreateSessionCompactionNodeInput | SessionCompactionNode,
> = T extends SessionCompactionNode ? T : Extract<SessionCompactionNode, { type: T['type'] }>;

export function getSessionCompactionSidecarPath(
  projectId: string,
  artifactDirId: string,
  sessionId: string
): string {
  const { dataRoot } = getConfig();
  return join(
    dataRoot,
    projectId,
    'artifacts',
    artifactDirId,
    'sessions',
    SESSION_META_DIR_NAME,
    `${sessionId}${SESSION_COMPACTION_FILE_SUFFIX}`
  );
}

export function createSessionCompactionNode<T extends CreateSessionCompactionNodeInput>(
  input: T
): PersistedSessionCompactionNode<T> {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  } as PersistedSessionCompactionNode<T>;
}

export async function appendSessionCompactionNode<
  T extends CreateSessionCompactionNodeInput | SessionCompactionNode,
>(
  projectId: string,
  artifactDirId: string,
  sessionId: string,
  input: T
): Promise<PersistedSessionCompactionNode<T>> {
  const node = isPersistedSessionCompactionNode(input) ? input : createSessionCompactionNode(input);
  const sidecarPath = getSessionCompactionSidecarPath(projectId, artifactDirId, sessionId);
  const sidecarDir = dirname(sidecarPath);
  const [didSidecarDirExist, didSidecarFileExist] = await Promise.all([
    pathExists(sidecarDir),
    pathExists(sidecarPath),
  ]);

  await ensureDir(sidecarDir);
  await appendFile(sidecarPath, `${JSON.stringify(node)}\n`, 'utf8');

  console.info('[session-compaction] Appended compaction node to sidecar', {
    projectId,
    artifactDirId,
    sessionId,
    nodeId: node.id,
    nodeType: node.type,
    sidecarPath,
    createdMetaDirectory: !didSidecarDirExist,
    createdSidecarFile: !didSidecarFileExist,
  });

  return node as PersistedSessionCompactionNode<T>;
}

export async function getSessionCompactionNodes(
  projectId: string,
  artifactDirId: string,
  sessionId: string
): Promise<SessionCompactionNode[]> {
  const sidecarPath = getSessionCompactionSidecarPath(projectId, artifactDirId, sessionId);
  if (!(await pathExists(sidecarPath))) {
    return [];
  }

  const content = await readFile(sidecarPath, 'utf8');
  return parseSessionCompactionNodes(sidecarPath, content);
}

export async function deleteSessionCompactionSidecar(
  projectId: string,
  artifactDirId: string,
  sessionId: string
): Promise<void> {
  const sidecarPath = getSessionCompactionSidecarPath(projectId, artifactDirId, sessionId);
  if (!(await pathExists(sidecarPath))) {
    return;
  }

  await rm(sidecarPath, { force: true });
}

function parseSessionCompactionNodes(path: string, content: string): SessionCompactionNode[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Failed to parse session compaction JSONL at ${path}:${index + 1}`);
    }

    return normalizeSessionCompactionNode(parsed, path, index + 1);
  });
}

function normalizeSessionCompactionNode(
  value: unknown,
  path: string,
  lineNumber: number
): SessionCompactionNode {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid session compaction node at ${path}:${lineNumber}`);
  }

  const record = value as Record<string, unknown>;
  const type = record['type'];
  if (!isSessionCompactionNodeType(type)) {
    throw new Error(`Invalid session compaction type at ${path}:${lineNumber}`);
  }

  return {
    id: requireNonEmptyString(record, 'id', path, lineNumber),
    type,
    createdAt: requireNonEmptyString(record, 'createdAt', path, lineNumber),
    branchName: requireNonEmptyString(record, 'branchName', path, lineNumber),
    firstNodeId: requireNonEmptyStringAlias(
      record,
      ['firstNodeId', 'beforeNodeId'],
      path,
      lineNumber
    ),
    lastNodeId: requireNonEmptyStringAlias(record, ['lastNodeId', 'afterNodeId'], path, lineNumber),
    compactionSummary: requireNonEmptyString(record, 'compactionSummary', path, lineNumber),
  } as SessionCompactionNode;
}

function requireNonEmptyStringAlias(
  record: Record<string, unknown>,
  keys: string[],
  path: string,
  lineNumber: number
): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  throw new Error(
    `Missing required one of "${keys.join('", "')}" in session compaction node at ${path}:${lineNumber}`
  );
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  lineNumber: number
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Missing required "${key}" in session compaction node at ${path}:${lineNumber}`
    );
  }

  return value;
}

function isPersistedSessionCompactionNode(
  value: CreateSessionCompactionNodeInput | SessionCompactionNode
): value is SessionCompactionNode {
  return 'id' in value && 'createdAt' in value;
}

function isSessionCompactionNodeType(value: unknown): value is SessionCompactionNodeType {
  return (
    typeof value === 'string' &&
    SESSION_COMPACTION_NODE_TYPES.includes(value as SessionCompactionNodeType)
  );
}
