import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getSdkConfig } from './config.js';

import type { Message } from '@ank1015/llm-core';

type MaybePromise<T> = T | Promise<T>;

export const SESSION_FORMAT_VERSION = 1 as const;

export interface SessionHeaderNode {
  type: 'session';
  version: typeof SESSION_FORMAT_VERSION;
  id: string;
  createdAt: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionMessageNode {
  type: 'message';
  id: string;
  parentId: string;
  branch: string;
  timestamp: string;
  message: Message;
  metadata?: Record<string, unknown>;
}

export interface SessionCustomNode {
  type: 'custom';
  id: string;
  parentId: string;
  branch: string;
  timestamp: string;
  name: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export type SessionNode = SessionMessageNode | SessionCustomNode;
export type SessionEntry = SessionHeaderNode | SessionNode;
export type SessionHead = SessionHeaderNode | SessionNode;

export interface Session {
  path: string;
  header: SessionHeaderNode;
  nodes: SessionNode[];
}

export interface SessionBranchInfo {
  name: string;
  headId: string;
  branchPointId: string | null;
  nodeCount: number;
}

export interface SessionLineage {
  path: string;
  sessionId: string;
  branch: string;
  head: SessionHead;
  entries: SessionEntry[];
  nodes: SessionNode[];
}

export interface CreateSessionInput {
  id?: string;
  path?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  baseDir?: string;
}

export interface SessionHeadSelector {
  branch?: string;
  headId?: string;
}

export interface SessionParentSelector {
  branch?: string;
  parentId?: string;
}

export interface SessionMessagesLoaderContext {
  path: string;
  session: Session;
  branch: string;
  head: SessionHead;
  lineage: SessionLineage;
}

export type SessionMessagesLoader = (
  context: SessionMessagesLoaderContext
) => MaybePromise<Message[]>;

export interface SessionNodeSaveContext {
  path: string;
  session: Session;
  node: SessionNode;
}

export type SessionNodeSaver = (context: SessionNodeSaveContext) => MaybePromise<void>;

export interface LoadSessionMessagesInput extends SessionHeadSelector {
  path: string;
  messagesLoader?: SessionMessagesLoader;
}

export interface LoadSessionMessagesResult {
  path: string;
  sessionId: string;
  branch: string;
  head: SessionHead;
  messages: Message[];
  lineage: SessionLineage;
}

export interface AppendSessionMessageInput extends SessionParentSelector {
  path?: string;
  message: Message;
  title?: string;
  metadata?: Record<string, unknown>;
  sessionMetadata?: Record<string, unknown>;
  baseDir?: string;
  saveNode?: SessionNodeSaver;
}

export interface AppendSessionMessageResult {
  path: string;
  sessionId: string;
  node: SessionMessageNode;
}

export interface AppendSessionCustomInput extends SessionParentSelector {
  path?: string;
  name: string;
  payload: unknown;
  title?: string;
  metadata?: Record<string, unknown>;
  sessionMetadata?: Record<string, unknown>;
  baseDir?: string;
  saveNode?: SessionNodeSaver;
}

export interface AppendSessionCustomResult {
  path: string;
  sessionId: string;
  node: SessionCustomNode;
}

export interface SessionAppenderMessageInput {
  message: Message;
  branch?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionAppenderCustomInput {
  name: string;
  payload: unknown;
  branch?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionAppender {
  readonly path: string;
  readonly sessionId: string;
  readonly branch: string;
  readonly headId: string;
  appendMessage(input: SessionAppenderMessageInput): Promise<AppendSessionMessageResult>;
  appendCustom(input: SessionAppenderCustomInput): Promise<AppendSessionCustomResult>;
}

export interface CreateSessionAppenderInput extends CreateSessionInput, SessionHeadSelector {
  saveNode?: SessionNodeSaver;
}

export class SessionNotFoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Session not found: ${path}`);
    this.name = 'SessionNotFoundError';
    this.path = path;
  }
}

export class SessionNodeNotFoundError extends Error {
  readonly path: string;
  readonly nodeId: string;

  constructor(path: string, nodeId: string) {
    super(`Session node "${nodeId}" not found in ${path}`);
    this.name = 'SessionNodeNotFoundError';
    this.path = path;
    this.nodeId = nodeId;
  }
}

export class InvalidSessionParentError extends Error {
  readonly path: string;
  readonly parentId: string;

  constructor(path: string, parentId: string) {
    super(`Invalid parentId "${parentId}" for session ${path}`);
    this.name = 'InvalidSessionParentError';
    this.path = path;
    this.parentId = parentId;
  }
}

export function createSessionPath(baseDir: string = getSdkConfig().sessionsBaseDir): string {
  return join(baseDir, `${randomUUID()}.jsonl`);
}

export async function createSession(input: CreateSessionInput = {}): Promise<Session> {
  const path = input.path ?? createSessionPath(input.baseDir);
  const header: SessionHeaderNode = {
    type: 'session',
    version: SESSION_FORMAT_VERSION,
    id: input.id ?? randomUUID(),
    createdAt: new Date().toISOString(),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${serializeEntry(header)}\n`, 'utf8');

  return {
    path,
    header,
    nodes: [],
  };
}

export async function ensureSession(input: CreateSessionInput = {}): Promise<Session> {
  if (input.path !== undefined) {
    const existing = await readSession(input.path);
    if (existing) {
      return existing;
    }
  }

  return createSession(input);
}

export async function readSession(path: string): Promise<Session | undefined> {
  const entries = await readSessionEntries(path);
  if (entries === undefined) {
    return undefined;
  }

  const [header, ...remainingEntries] = entries;
  if (!header || header.type !== 'session') {
    throw new Error(`Invalid session file "${path}": first JSONL entry must be a session header`);
  }

  return {
    path,
    header,
    nodes: remainingEntries as SessionNode[],
  };
}

export async function getSessionNode(
  path: string,
  nodeId: string
): Promise<SessionEntry | undefined> {
  const session = await readSession(path);
  if (!session) {
    return undefined;
  }

  if (session.header.id === nodeId) {
    return session.header;
  }

  return session.nodes.find((node) => node.id === nodeId);
}

export async function getSessionHead(
  path: string,
  selector: SessionHeadSelector = {}
): Promise<SessionHead | undefined> {
  const session = await readSession(path);
  if (!session) {
    return undefined;
  }

  return resolveSessionHead(session, selector);
}

export async function getSessionLineage(
  path: string,
  selector: SessionHeadSelector = {}
): Promise<SessionLineage | undefined> {
  const session = await readSession(path);
  if (!session) {
    return undefined;
  }

  return buildSessionLineage(session, selector);
}

export async function loadSessionMessages(
  input: LoadSessionMessagesInput
): Promise<LoadSessionMessagesResult | undefined> {
  const session = await readSession(input.path);
  if (!session) {
    return undefined;
  }

  const lineage = buildSessionLineage(session, input);
  const messages =
    input.messagesLoader !== undefined
      ? await input.messagesLoader({
          path: input.path,
          session,
          branch: lineage.branch,
          head: lineage.head,
          lineage,
        })
      : defaultMessagesLoader(lineage);

  return {
    path: input.path,
    sessionId: session.header.id,
    branch: lineage.branch,
    head: lineage.head,
    messages,
    lineage,
  };
}

export async function appendSessionMessage(
  input: AppendSessionMessageInput
): Promise<AppendSessionMessageResult> {
  const session = await ensureSession({
    ...(input.path !== undefined ? { path: input.path } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.sessionMetadata !== undefined ? { metadata: input.sessionMetadata } : {}),
    ...(input.baseDir !== undefined ? { baseDir: input.baseDir } : {}),
  });

  const parent = resolveParentHead(session, input);
  if (parent === undefined) {
    throw new InvalidSessionParentError(session.path, input.parentId!);
  }

  const node: SessionMessageNode = {
    type: 'message',
    id: randomUUID(),
    parentId: parent.id,
    branch: input.branch ?? 'main',
    timestamp: new Date().toISOString(),
    message: input.message,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };

  await persistSessionNode(session, node, input.saveNode);

  return {
    path: session.path,
    sessionId: session.header.id,
    node,
  };
}

export async function appendSessionCustom(
  input: AppendSessionCustomInput
): Promise<AppendSessionCustomResult> {
  const session = await ensureSession({
    ...(input.path !== undefined ? { path: input.path } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.sessionMetadata !== undefined ? { metadata: input.sessionMetadata } : {}),
    ...(input.baseDir !== undefined ? { baseDir: input.baseDir } : {}),
  });

  const parent = resolveParentHead(session, input);
  if (parent === undefined) {
    throw new InvalidSessionParentError(session.path, input.parentId!);
  }

  const node: SessionCustomNode = {
    type: 'custom',
    id: randomUUID(),
    parentId: parent.id,
    branch: input.branch ?? 'main',
    timestamp: new Date().toISOString(),
    name: input.name,
    payload: input.payload,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };

  await persistSessionNode(session, node, input.saveNode);

  return {
    path: session.path,
    sessionId: session.header.id,
    node,
  };
}

export async function createSessionAppender(
  input: CreateSessionAppenderInput = {}
): Promise<SessionAppender> {
  const session = await ensureSession({
    ...(input.path !== undefined ? { path: input.path } : {}),
    ...(input.id !== undefined ? { id: input.id } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.baseDir !== undefined ? { baseDir: input.baseDir } : {}),
  });

  const lineage = buildSessionLineage(session, {
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    ...(input.headId !== undefined ? { headId: input.headId } : {}),
  });

  return new BoundSessionAppender(session, lineage.branch, lineage.head.id, input.saveNode);
}

export async function listSessionBranches(path: string): Promise<SessionBranchInfo[] | undefined> {
  const session = await readSession(path);
  if (!session) {
    return undefined;
  }

  const branches = new Map<string, SessionBranchInfo>();
  branches.set('main', {
    name: 'main',
    headId: session.header.id,
    branchPointId: null,
    nodeCount: 0,
  });

  for (const node of session.nodes) {
    const existing = branches.get(node.branch);
    if (existing) {
      existing.headId = node.id;
      existing.nodeCount += 1;
      continue;
    }

    const branchPoint = session.nodes.find((candidate) => candidate.id === node.parentId);
    branches.set(node.branch, {
      name: node.branch,
      headId: node.id,
      nodeCount: 1,
      branchPointId:
        branchPoint && branchPoint.branch !== node.branch ? branchPoint.id : session.header.id,
    });
  }

  return [...branches.values()];
}

async function readSessionEntries(path: string): Promise<SessionEntry[] | undefined> {
  try {
    const content = await readFile(path, 'utf8');
    return parseSessionEntries(path, content);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

function parseSessionEntries(path: string, content: string): SessionEntry[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as SessionEntry;
    } catch {
      throw new Error(`Failed to parse session JSONL at ${path}:${index + 1}`);
    }
  });
}

function serializeEntry(entry: SessionEntry): string {
  return JSON.stringify(entry);
}

class BoundSessionAppender implements SessionAppender {
  private currentBranch: string;
  private currentHeadId: string;
  private readonly saveNode: SessionNodeSaver | undefined;
  private readonly session: Session;

  constructor(
    session: Session,
    branch: string,
    headId: string,
    saveNode: SessionNodeSaver | undefined
  ) {
    this.session = session;
    this.currentBranch = branch;
    this.currentHeadId = headId;
    this.saveNode = saveNode;
  }

  get path(): string {
    return this.session.path;
  }

  get sessionId(): string {
    return this.session.header.id;
  }

  get branch(): string {
    return this.currentBranch;
  }

  get headId(): string {
    return this.currentHeadId;
  }

  async appendMessage(input: SessionAppenderMessageInput): Promise<AppendSessionMessageResult> {
    const node: SessionMessageNode = {
      type: 'message',
      id: randomUUID(),
      parentId: this.currentHeadId,
      branch: input.branch ?? this.currentBranch,
      timestamp: new Date().toISOString(),
      message: input.message,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    await persistSessionNode(this.session, node, this.saveNode);
    this.session.nodes.push(node);
    this.currentHeadId = node.id;
    this.currentBranch = node.branch;

    return {
      path: this.session.path,
      sessionId: this.session.header.id,
      node,
    };
  }

  async appendCustom(input: SessionAppenderCustomInput): Promise<AppendSessionCustomResult> {
    const node: SessionCustomNode = {
      type: 'custom',
      id: randomUUID(),
      parentId: this.currentHeadId,
      branch: input.branch ?? this.currentBranch,
      timestamp: new Date().toISOString(),
      name: input.name,
      payload: input.payload,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    await persistSessionNode(this.session, node, this.saveNode);
    this.session.nodes.push(node);
    this.currentHeadId = node.id;
    this.currentBranch = node.branch;

    return {
      path: this.session.path,
      sessionId: this.session.header.id,
      node,
    };
  }
}

function resolveSessionHead(session: Session, selector: SessionHeadSelector): SessionHead {
  if (selector.headId !== undefined) {
    if (selector.headId === session.header.id) {
      return session.header;
    }

    const explicitHead = session.nodes.find((node) => node.id === selector.headId);
    if (!explicitHead) {
      throw new SessionNodeNotFoundError(session.path, selector.headId);
    }

    return explicitHead;
  }

  const branch = selector.branch ?? 'main';
  const branchHead = findLatestNodeInBranch(session.nodes, branch);
  if (branchHead) {
    return branchHead;
  }

  const mainHead = findLatestNodeInBranch(session.nodes, 'main');
  if (mainHead) {
    return mainHead;
  }

  return session.header;
}

function buildSessionLineage(
  session: Session,
  selector: SessionHeadSelector
): SessionLineage {
  const head = resolveSessionHead(session, selector);
  const branch =
    selector.headId !== undefined
      ? head.type !== 'session'
        ? head.branch
        : selector.branch ?? 'main'
      : selector.branch ?? (head.type !== 'session' ? head.branch : 'main');
  const nodeById = new Map(session.nodes.map((node) => [node.id, node]));
  const entries: SessionEntry[] = [];

  let current: SessionHead | undefined = head;

  while (current) {
    entries.push(current);

    if (current.type === 'session') {
      break;
    }

    if (current.parentId === session.header.id) {
      entries.push(session.header);
      break;
    }

    const parent = nodeById.get(current.parentId);
    if (!parent) {
      throw new InvalidSessionParentError(session.path, current.parentId);
    }

    current = parent;
  }

  entries.reverse();

  return {
    path: session.path,
    sessionId: session.header.id,
    branch,
    head,
    entries,
    nodes: entries.filter((entry): entry is SessionNode => entry.type !== 'session'),
  };
}

function defaultMessagesLoader(lineage: SessionLineage): Message[] {
  return lineage.nodes
    .filter((node): node is SessionMessageNode => node.type === 'message')
    .map((node) => node.message);
}

function resolveParentHead(
  session: Session,
  input: SessionParentSelector
): SessionHead | undefined {
  if (input.parentId !== undefined) {
    if (input.parentId === session.header.id) {
      return session.header;
    }

    return session.nodes.find((node) => node.id === input.parentId);
  }

  const branch = input.branch ?? 'main';
  const branchHead = findLatestNodeInBranch(session.nodes, branch);
  if (branchHead) {
    return branchHead;
  }

  const mainHead = findLatestNodeInBranch(session.nodes, 'main');
  if (mainHead) {
    return mainHead;
  }

  return session.header;
}

function findLatestNodeInBranch(
  nodes: SessionNode[],
  branch: string
): SessionNode | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index]?.branch === branch) {
      return nodes[index];
    }
  }

  return undefined;
}

async function persistSessionNode(
  session: Session,
  node: SessionNode,
  saveNode: SessionNodeSaver | undefined
): Promise<void> {
  if (saveNode) {
    await saveNode({
      path: session.path,
      session,
      node,
    });
    return;
  }

  await mkdir(dirname(session.path), { recursive: true });
  await appendFile(session.path, `${serializeEntry(node)}\n`, 'utf8');
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
