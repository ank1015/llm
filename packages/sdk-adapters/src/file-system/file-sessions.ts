/**
 * File-based Sessions Adapter
 *
 * Stores sessions as JSONL files in ~/.llm/sessions/<projectName>/<path>/<sessionId>.jsonl
 * Sessions are tree structures with branching support.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { InvalidParentError, PathTraversalError, SessionNotFoundError } from '@ank1015/llm-types';

import { createSessionId } from '../shared/session-id.js';

import type {
  AppendCustomInput,
  AppendMessageInput,
  CreateSessionInput,
  SessionLocation,
  SessionsAdapter,
  BranchInfo,
  CustomNode,
  MessageNode,
  Session,
  SessionHeader,
  SessionNode,
  SessionSummary,
} from '@ank1015/llm-types';

/** Default base directory for all sessions */
const DEFAULT_SESSIONS_BASE_DIR = join(homedir(), '.llm', 'sessions');

/**
 * Validate a path component against directory traversal attacks.
 */
function sanitizePath(component: string): string {
  if (component.includes('..') || component.startsWith('/') || component.startsWith('\\')) {
    throw new PathTraversalError(component);
  }
  return component.trim().replace(/\\/g, '/');
}

/**
 * Generate an ISO 8601 timestamp.
 */
function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse a JSONL file into an array of nodes.
 */
function parseJsonl(filePath: string): SessionNode[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as SessionNode;
    } catch {
      throw new Error(`Failed to parse line ${index + 1} in ${filePath}`);
    }
  });
}

/**
 * Serialize nodes to JSONL format.
 */
function toJsonl(nodes: SessionNode[]): string {
  return nodes.map((node) => JSON.stringify(node)).join('\n') + '\n';
}

/**
 * Append a single node to a session file.
 */
function appendNode(filePath: string, node: SessionNode): void {
  appendFileSync(filePath, JSON.stringify(node) + '\n', 'utf8');
}

/**
 * File-based implementation of SessionsAdapter.
 */
export class FileSessionsAdapter implements SessionsAdapter {
  private baseDir: string;

  constructor(baseDir: string = DEFAULT_SESSIONS_BASE_DIR) {
    this.baseDir = baseDir;
  }

  /**
   * Get the full directory path for a project/path combination.
   */
  private getSessionDir(projectName: string, path: string = ''): string {
    sanitizePath(projectName);
    if (path) sanitizePath(path);
    return join(this.baseDir, projectName, path);
  }

  /**
   * Get the full file path for a session.
   */
  private getSessionFilePath(projectName: string, path: string = '', sessionId: string): string {
    sanitizePath(sessionId);
    return join(this.getSessionDir(projectName, path), `${sessionId}.jsonl`);
  }

  /**
   * Ensure a directory exists.
   */
  private ensureDir(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<{ sessionId: string; header: SessionHeader }> {
    const { projectName, path = '', sessionName } = input;
    const sessionId = createSessionId();
    const dirPath = this.getSessionDir(projectName, path);
    const filePath = this.getSessionFilePath(projectName, path, sessionId);

    this.ensureDir(dirPath);

    const header: SessionHeader = {
      type: 'session',
      id: sessionId,
      parentId: null,
      branch: 'main',
      timestamp: timestamp(),
      sessionName: sessionName ?? `Session ${new Date().toLocaleDateString()}`,
    };

    writeFileSync(filePath, JSON.stringify(header) + '\n', 'utf8');

    return { sessionId, header };
  }

  async getSession(location: SessionLocation): Promise<Session | undefined> {
    const { projectName, path = '', sessionId } = location;
    const filePath = this.getSessionFilePath(projectName, path, sessionId);

    if (!existsSync(filePath)) {
      return undefined;
    }

    const nodes = parseJsonl(filePath);

    if (nodes.length === 0) {
      return undefined;
    }

    const header = nodes[0];
    if (header?.type !== 'session') {
      throw new Error(`Invalid session file: first node is not a session header`);
    }

    return {
      location: { projectName, path, sessionId },
      header: header as SessionHeader,
      nodes,
    };
  }

  async deleteSession(location: SessionLocation): Promise<boolean> {
    const { projectName, path = '', sessionId } = location;
    const filePath = this.getSessionFilePath(projectName, path, sessionId);

    if (!existsSync(filePath)) {
      return false;
    }

    unlinkSync(filePath);
    return true;
  }

  async updateSessionName(
    location: SessionLocation,
    sessionName: string
  ): Promise<SessionHeader | undefined> {
    const { projectName, path = '', sessionId } = location;
    const filePath = this.getSessionFilePath(projectName, path, sessionId);

    if (!existsSync(filePath)) {
      return undefined;
    }

    const nodes = parseJsonl(filePath);

    if (nodes.length === 0 || nodes[0]?.type !== 'session') {
      throw new Error(`Invalid session file: first node is not a session header`);
    }

    const header = nodes[0] as SessionHeader;
    const updatedHeader: SessionHeader = {
      ...header,
      sessionName,
    };

    nodes[0] = updatedHeader;

    // Rewrite the entire file with updated header
    writeFileSync(filePath, toJsonl(nodes), 'utf8');

    return updatedHeader;
  }

  async listSessions(projectName: string, path: string = ''): Promise<SessionSummary[]> {
    const dirPath = this.getSessionDir(projectName, path);

    if (!existsSync(dirPath)) {
      return [];
    }

    const files = readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
    const summaries: SessionSummary[] = [];

    for (const file of files) {
      const filePath = join(dirPath, file);
      const sessionId = file.replace('.jsonl', '');

      try {
        const nodes = parseJsonl(filePath);

        if (nodes.length === 0 || nodes[0]?.type !== 'session') {
          continue;
        }

        const header = nodes[0] as SessionHeader;
        const stat = statSync(filePath);

        // Collect unique branch names
        const branches = [...new Set(nodes.map((n) => n.branch))];

        summaries.push({
          sessionId,
          sessionName: header.sessionName,
          filePath,
          createdAt: header.timestamp,
          updatedAt: stat.mtime.toISOString(),
          nodeCount: nodes.length,
          branches,
        });
      } catch {
        // Skip invalid files
        continue;
      }
    }

    // Sort by updatedAt descending (most recent first)
    summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return summaries;
  }

  async listProjects(): Promise<string[]> {
    if (!existsSync(this.baseDir)) {
      return [];
    }

    return readdirSync(this.baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  async appendMessage(
    input: AppendMessageInput
  ): Promise<{ sessionId: string; node: MessageNode }> {
    const {
      projectName,
      path = '',
      sessionId,
      parentId: inputParentId,
      branch,
      message,
      api,
      modelId,
      providerOptions = {},
    } = input;

    let actualSessionId = sessionId;
    let parentId = inputParentId;
    let filePath: string;

    if (!actualSessionId) {
      // No sessionId provided — auto-create, use header as parent
      const { sessionId: newId, header } = await this.createSession({ projectName, path });
      actualSessionId = newId;
      parentId = header.id;
      filePath = this.getSessionFilePath(projectName, path, actualSessionId);
    } else {
      filePath = this.getSessionFilePath(projectName, path, actualSessionId);

      if (!existsSync(filePath)) {
        throw new SessionNotFoundError(actualSessionId);
      }
    }

    // Validate parentId exists in the session
    const nodes = parseJsonl(filePath);
    if (!nodes.some((n) => n.id === parentId)) {
      throw new InvalidParentError(parentId, actualSessionId);
    }

    const node: MessageNode = {
      type: 'message',
      id: createSessionId(),
      parentId,
      branch,
      timestamp: timestamp(),
      message,
      api,
      modelId,
      providerOptions,
    };

    appendNode(filePath, node);

    return { sessionId: actualSessionId, node };
  }

  async appendCustom(input: AppendCustomInput): Promise<CustomNode | undefined> {
    const { projectName, path = '', sessionId, parentId, branch, payload } = input;
    const filePath = this.getSessionFilePath(projectName, path, sessionId);

    if (!existsSync(filePath)) {
      return undefined;
    }

    // Validate parentId exists in the session
    const nodes = parseJsonl(filePath);
    if (!nodes.some((n) => n.id === parentId)) {
      throw new InvalidParentError(parentId, sessionId);
    }

    const node: CustomNode = {
      type: 'custom',
      id: createSessionId(),
      parentId,
      branch,
      timestamp: timestamp(),
      payload,
    };

    appendNode(filePath, node);

    return node;
  }

  async getBranches(location: SessionLocation): Promise<BranchInfo[] | undefined> {
    const session = await this.getSession(location);

    if (!session) {
      return undefined;
    }

    const branchMap = new Map<string, { nodes: SessionNode[]; branchPointId: string | null }>();

    // Group nodes by branch
    for (const node of session.nodes) {
      if (!branchMap.has(node.branch)) {
        branchMap.set(node.branch, { nodes: [], branchPointId: null });
      }
      branchMap.get(node.branch)!.nodes.push(node);
    }

    // Find branch points
    for (const [branchName, data] of branchMap) {
      if (branchName === 'main') {
        continue;
      }

      const firstNode = data.nodes[0];
      if (firstNode && firstNode.parentId) {
        const parent = session.nodes.find((n) => n.id === firstNode.parentId);
        if (parent && parent.branch !== branchName) {
          data.branchPointId = firstNode.parentId;
        }
      }
    }

    const branches: BranchInfo[] = [];

    for (const [name, data] of branchMap) {
      const latestNode = data.nodes[data.nodes.length - 1];
      branches.push({
        name,
        branchPointId: data.branchPointId,
        nodeCount: data.nodes.length,
        latestNodeId: latestNode?.id ?? '',
      });
    }

    return branches;
  }

  async getBranchHistory(
    location: SessionLocation,
    branch: string
  ): Promise<SessionNode[] | undefined> {
    const session = await this.getSession(location);

    if (!session) {
      return undefined;
    }

    // Build parent-child map
    const childMap = new Map<string | null, SessionNode[]>();
    for (const node of session.nodes) {
      const children = childMap.get(node.parentId) ?? [];
      children.push(node);
      childMap.set(node.parentId, children);
    }

    // Traverse from header following the specified branch
    const history: SessionNode[] = [];
    let currentId: string | null = null;

    while (true) {
      const children: SessionNode[] = childMap.get(currentId) ?? [];

      let next: SessionNode | undefined = children.find((c: SessionNode) => c.branch === branch);

      if (!next && currentId === null) {
        next = children[0];
      }

      if (!next) {
        break;
      }

      history.push(next);
      currentId = next.id;
    }

    return history;
  }

  async getNode(location: SessionLocation, nodeId: string): Promise<SessionNode | undefined> {
    const session = await this.getSession(location);

    if (!session) {
      return undefined;
    }

    return session.nodes.find((n) => n.id === nodeId);
  }

  async getLatestNode(
    location: SessionLocation,
    branch?: string
  ): Promise<SessionNode | undefined> {
    const session = await this.getSession(location);

    if (!session || session.nodes.length === 0) {
      return undefined;
    }

    if (branch) {
      const branchNodes = session.nodes.filter((n) => n.branch === branch);
      return branchNodes[branchNodes.length - 1];
    }

    return session.nodes[session.nodes.length - 1];
  }

  async getMessages(
    location: SessionLocation,
    branch?: string
  ): Promise<MessageNode[] | undefined> {
    const session = await this.getSession(location);

    if (!session) {
      return undefined;
    }

    let nodes = session.nodes.filter((n): n is MessageNode => n.type === 'message');

    if (branch) {
      nodes = nodes.filter((n) => n.branch === branch);
    }

    return nodes;
  }

  async searchSessions(
    projectName: string,
    query: string,
    path: string = ''
  ): Promise<SessionSummary[]> {
    const sessions = await this.listSessions(projectName, path);
    const lowerQuery = query.toLowerCase();

    return sessions.filter((s) => s.sessionName.toLowerCase().includes(lowerQuery));
  }

  /**
   * Get the base directory for sessions.
   */
  getSessionsBaseDir(): string {
    return this.baseDir;
  }
}

/**
 * Create a FileSessionsAdapter with the default base directory.
 */
export function createFileSessionsAdapter(baseDir?: string): FileSessionsAdapter {
  return new FileSessionsAdapter(baseDir);
}
