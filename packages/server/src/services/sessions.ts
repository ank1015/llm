/**
 * Session Management Service
 *
 * Manages session files stored as JSONL (JSON Lines) format.
 * Sessions are tree structures with branching support for conversation history.
 * Files are stored in ~/.llm/sessions/<projectName>/<path>/<sessionId>.jsonl
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

import { generateUUID } from '@ank1015/llm-core';

import type {
  Api,
  BranchInfo,
  CustomNode,
  Message,
  MessageNode,
  Session,
  SessionHeader,
  SessionNode,
  SessionSummary,
} from '@ank1015/llm-types';

/** Base directory for all sessions */
const SESSIONS_BASE_DIR = join(homedir(), '.llm', 'sessions');

/**
 * Get the full directory path for a project/path combination.
 */
function getSessionDir(projectName: string, path: string): string {
  return join(SESSIONS_BASE_DIR, projectName, path);
}

/**
 * Get the full file path for a session.
 */
function getSessionFilePath(projectName: string, path: string, sessionId: string): string {
  return join(getSessionDir(projectName, path), `${sessionId}.jsonl`);
}

/**
 * Ensure a directory exists.
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
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
 * Session Management Service
 */
export const SessionService = {
  /**
   * Create a new session.
   *
   * @param projectName - Project name
   * @param path - Path within project (defaults to empty string for root)
   * @param sessionName - Optional session name
   * @returns The created session ID and header
   */
  createSession(
    projectName: string,
    path: string = '',
    sessionName?: string
  ): { sessionId: string; header: SessionHeader } {
    const sessionId = generateUUID();
    const dirPath = getSessionDir(projectName, path);
    const filePath = getSessionFilePath(projectName, path, sessionId);

    ensureDir(dirPath);

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
  },

  /**
   * Get a session by ID.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @returns The session or undefined if not found
   */
  getSession(projectName: string, path: string, sessionId: string): Session | undefined {
    const filePath = getSessionFilePath(projectName, path, sessionId);

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
  },

  /**
   * Delete a session.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @returns true if deleted, false if not found
   */
  deleteSession(projectName: string, path: string, sessionId: string): boolean {
    const filePath = getSessionFilePath(projectName, path, sessionId);

    if (!existsSync(filePath)) {
      return false;
    }

    unlinkSync(filePath);
    return true;
  },

  /**
   * Update the session name.
   * This rewrites the first line (header) of the session file.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @param sessionName - New session name
   * @returns The updated header or undefined if session not found
   */
  updateSessionName(
    projectName: string,
    path: string,
    sessionId: string,
    sessionName: string
  ): SessionHeader | undefined {
    const filePath = getSessionFilePath(projectName, path, sessionId);

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
  },

  /**
   * Append a message node to a session.
   * If session doesn't exist, creates it first.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID (optional - creates new session if not provided)
   * @param parentId - Parent node ID
   * @param branch - Branch name
   * @param message - The message to store
   * @param api - API provider
   * @param modelId - Model ID
   * @param providerOptions - Provider options
   * @returns The created node and session ID
   */
  appendMessage(
    projectName: string,
    path: string,
    sessionId: string | undefined,
    parentId: string,
    branch: string,
    message: Message,
    api: Api,
    modelId: string,
    providerOptions: Record<string, unknown> = {}
  ): { sessionId: string; node: MessageNode } {
    let actualSessionId = sessionId;
    let filePath: string;

    // Create session if it doesn't exist
    if (!actualSessionId) {
      const { sessionId: newId } = this.createSession(projectName, path);
      actualSessionId = newId;
      filePath = getSessionFilePath(projectName, path, actualSessionId);
    } else {
      filePath = getSessionFilePath(projectName, path, actualSessionId);

      if (!existsSync(filePath)) {
        // Session ID provided but file doesn't exist - create it
        const { sessionId: newId } = this.createSession(projectName, path);
        actualSessionId = newId;
        filePath = getSessionFilePath(projectName, path, actualSessionId);
      }
    }

    const node: MessageNode = {
      type: 'message',
      id: generateUUID(),
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
  },

  /**
   * Append a custom node to a session.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @param parentId - Parent node ID
   * @param branch - Branch name
   * @param payload - Custom payload
   * @returns The created node or undefined if session not found
   */
  appendCustom(
    projectName: string,
    path: string,
    sessionId: string,
    parentId: string,
    branch: string,
    payload: Record<string, unknown>
  ): CustomNode | undefined {
    const filePath = getSessionFilePath(projectName, path, sessionId);

    if (!existsSync(filePath)) {
      return undefined;
    }

    const node: CustomNode = {
      type: 'custom',
      id: generateUUID(),
      parentId,
      branch,
      timestamp: timestamp(),
      payload,
    };

    appendNode(filePath, node);

    return node;
  },

  /**
   * List all sessions in a project/path.
   *
   * @param projectName - Project name
   * @param path - Path within project (optional)
   * @returns Array of session summaries
   */
  listSessions(projectName: string, path: string = ''): SessionSummary[] {
    const dirPath = getSessionDir(projectName, path);

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
  },

  /**
   * List all projects.
   *
   * @returns Array of project names
   */
  listProjects(): string[] {
    if (!existsSync(SESSIONS_BASE_DIR)) {
      return [];
    }

    return readdirSync(SESSIONS_BASE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  },

  /**
   * Get branch information for a session.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @returns Array of branch info or undefined if session not found
   */
  getBranches(projectName: string, path: string, sessionId: string): BranchInfo[] | undefined {
    const session = this.getSession(projectName, path, sessionId);

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

    // Find branch points (where a branch diverges from another)
    for (const [branchName, data] of branchMap) {
      if (branchName === 'main') {
        continue;
      }

      // First node in non-main branch - its parent is the branch point
      const firstNode = data.nodes[0];
      if (firstNode && firstNode.parentId) {
        // Find which branch the parent belongs to
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
  },

  /**
   * Get the linear history of a branch (from root to latest).
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @param branch - Branch name
   * @returns Array of nodes in order, or undefined if session not found
   */
  getBranchHistory(
    projectName: string,
    path: string,
    sessionId: string,
    branch: string
  ): SessionNode[] | undefined {
    const session = this.getSession(projectName, path, sessionId);

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
    let currentId: string | null = null; // Start from header (parentId: null)

    while (true) {
      const children: SessionNode[] = childMap.get(currentId) ?? [];

      // Find child on the target branch, or any child if we're still on main path
      let next: SessionNode | undefined = children.find((c: SessionNode) => c.branch === branch);

      if (!next && currentId === null) {
        // Start with header
        next = children[0];
      }

      if (!next) {
        break;
      }

      history.push(next);
      currentId = next.id;
    }

    return history;
  },

  /**
   * Get the latest node in a branch.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @param branch - Branch name (optional - uses last message's branch if not provided)
   * @returns The latest node or undefined
   */
  getLatestNode(
    projectName: string,
    path: string,
    sessionId: string,
    branch?: string
  ): SessionNode | undefined {
    const session = this.getSession(projectName, path, sessionId);

    if (!session || session.nodes.length === 0) {
      return undefined;
    }

    if (branch) {
      // Find latest node in specified branch
      const branchNodes = session.nodes.filter((n) => n.branch === branch);
      return branchNodes[branchNodes.length - 1];
    }

    // Return the absolute latest node
    return session.nodes[session.nodes.length - 1];
  },

  /**
   * Get a specific node by ID.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @param nodeId - Node ID
   * @returns The node or undefined
   */
  getNode(
    projectName: string,
    path: string,
    sessionId: string,
    nodeId: string
  ): SessionNode | undefined {
    const session = this.getSession(projectName, path, sessionId);

    if (!session) {
      return undefined;
    }

    return session.nodes.find((n) => n.id === nodeId);
  },

  /**
   * Get all messages (MessageNode only) from a session.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param sessionId - Session ID
   * @param branch - Optional branch filter
   * @returns Array of message nodes
   */
  getMessages(
    projectName: string,
    path: string,
    sessionId: string,
    branch?: string
  ): MessageNode[] | undefined {
    const session = this.getSession(projectName, path, sessionId);

    if (!session) {
      return undefined;
    }

    let nodes = session.nodes.filter((n): n is MessageNode => n.type === 'message');

    if (branch) {
      nodes = nodes.filter((n) => n.branch === branch);
    }

    return nodes;
  },

  /**
   * Search sessions by name.
   *
   * @param projectName - Project name
   * @param path - Path within project
   * @param query - Search query (case-insensitive)
   * @returns Array of matching session summaries
   */
  searchSessions(projectName: string, path: string, query: string): SessionSummary[] {
    const sessions = this.listSessions(projectName, path);
    const lowerQuery = query.toLowerCase();

    return sessions.filter((s) => s.sessionName.toLowerCase().includes(lowerQuery));
  },

  /**
   * Get the base directory for sessions.
   */
  getSessionsBaseDir(): string {
    return SESSIONS_BASE_DIR;
  },
};
