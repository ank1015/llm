/**
 * In-memory Sessions Adapter
 *
 * Simple Map-based implementation for testing. No persistence.
 */

import { InvalidParentError, SessionNotFoundError } from '@ank1015/llm-types';

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

interface StoredSession {
  location: SessionLocation;
  header: SessionHeader;
  nodes: SessionNode[];
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory implementation of SessionsAdapter for testing.
 */
export class InMemorySessionsAdapter implements SessionsAdapter {
  private sessions = new Map<string, StoredSession>();

  private getKey(projectName: string, path: string, sessionId: string): string {
    return `${projectName}/${path}/${sessionId}`;
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<{ sessionId: string; header: SessionHeader }> {
    const { projectName, path = '', sessionName } = input;
    const sessionId = createSessionId();
    const now = new Date().toISOString();

    const header: SessionHeader = {
      type: 'session',
      id: sessionId,
      parentId: null,
      branch: 'main',
      timestamp: now,
      sessionName: sessionName ?? `Session ${new Date().toLocaleDateString()}`,
    };

    const key = this.getKey(projectName, path, sessionId);
    this.sessions.set(key, {
      location: { projectName, path, sessionId },
      header,
      nodes: [header],
      createdAt: now,
      updatedAt: now,
    });

    return { sessionId, header };
  }

  async getSession(location: SessionLocation): Promise<Session | undefined> {
    const { projectName, path = '', sessionId } = location;
    const key = this.getKey(projectName, path, sessionId);
    const stored = this.sessions.get(key);

    if (!stored) return undefined;

    return {
      location: stored.location,
      header: stored.header,
      nodes: [...stored.nodes],
    };
  }

  async deleteSession(location: SessionLocation): Promise<boolean> {
    const { projectName, path = '', sessionId } = location;
    const key = this.getKey(projectName, path, sessionId);
    return this.sessions.delete(key);
  }

  async updateSessionName(
    location: SessionLocation,
    sessionName: string
  ): Promise<SessionHeader | undefined> {
    const { projectName, path = '', sessionId } = location;
    const key = this.getKey(projectName, path, sessionId);
    const stored = this.sessions.get(key);

    if (!stored) return undefined;

    const updatedHeader: SessionHeader = { ...stored.header, sessionName };
    stored.header = updatedHeader;
    stored.nodes[0] = updatedHeader;
    stored.updatedAt = new Date().toISOString();

    return updatedHeader;
  }

  async listSessions(projectName: string, path: string = ''): Promise<SessionSummary[]> {
    const summaries: SessionSummary[] = [];
    const prefix = `${projectName}/${path}/`;

    for (const [key, stored] of this.sessions) {
      if (key.startsWith(prefix)) {
        const branches = [...new Set(stored.nodes.map((n) => n.branch))];
        summaries.push({
          sessionId: stored.location.sessionId,
          sessionName: stored.header.sessionName,
          filePath: key,
          createdAt: stored.createdAt,
          updatedAt: stored.updatedAt,
          nodeCount: stored.nodes.length,
          branches,
        });
      }
    }

    summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return summaries;
  }

  async listProjects(): Promise<string[]> {
    const projects = new Set<string>();
    for (const stored of this.sessions.values()) {
      projects.add(stored.location.projectName);
    }
    return [...projects];
  }

  async appendMessage(
    input: AppendMessageInput
  ): Promise<{ sessionId: string; node: MessageNode }> {
    const {
      projectName,
      path = '',
      sessionId,
      parentId,
      branch,
      message,
      api,
      modelId,
      providerOptions = {},
    } = input;

    let actualSessionId = sessionId;

    if (!actualSessionId) {
      const { sessionId: newId } = await this.createSession({ projectName, path });
      actualSessionId = newId;
    }

    const key = this.getKey(projectName, path, actualSessionId);
    const stored = this.sessions.get(key);

    if (!stored) {
      throw new SessionNotFoundError(actualSessionId);
    }

    if (!stored.nodes.some((n) => n.id === parentId)) {
      throw new InvalidParentError(parentId, actualSessionId);
    }

    const node: MessageNode = {
      type: 'message',
      id: createSessionId(),
      parentId,
      branch,
      timestamp: new Date().toISOString(),
      message,
      api,
      modelId,
      providerOptions,
    };

    stored.nodes.push(node);
    stored.updatedAt = new Date().toISOString();

    return { sessionId: actualSessionId, node };
  }

  async appendCustom(input: AppendCustomInput): Promise<CustomNode | undefined> {
    const { projectName, path = '', sessionId, parentId, branch, payload } = input;
    const key = this.getKey(projectName, path, sessionId);
    const stored = this.sessions.get(key);

    if (!stored) return undefined;

    if (!stored.nodes.some((n) => n.id === parentId)) {
      throw new InvalidParentError(parentId, sessionId);
    }

    const node: CustomNode = {
      type: 'custom',
      id: createSessionId(),
      parentId,
      branch,
      timestamp: new Date().toISOString(),
      payload,
    };

    stored.nodes.push(node);
    stored.updatedAt = new Date().toISOString();

    return node;
  }

  async getBranches(location: SessionLocation): Promise<BranchInfo[] | undefined> {
    const session = await this.getSession(location);
    if (!session) return undefined;

    const branchMap = new Map<string, { nodes: SessionNode[]; branchPointId: string | null }>();

    for (const node of session.nodes) {
      if (!branchMap.has(node.branch)) {
        branchMap.set(node.branch, { nodes: [], branchPointId: null });
      }
      branchMap.get(node.branch)!.nodes.push(node);
    }

    for (const [branchName, data] of branchMap) {
      if (branchName === 'main') continue;
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
    if (!session) return undefined;

    const childMap = new Map<string | null, SessionNode[]>();
    for (const node of session.nodes) {
      const children = childMap.get(node.parentId) ?? [];
      children.push(node);
      childMap.set(node.parentId, children);
    }

    const history: SessionNode[] = [];
    let currentId: string | null = null;

    while (true) {
      const children: SessionNode[] = childMap.get(currentId) ?? [];
      let next: SessionNode | undefined = children.find((c) => c.branch === branch);
      if (!next && currentId === null) {
        next = children[0];
      }
      if (!next) break;
      history.push(next);
      currentId = next.id;
    }

    return history;
  }

  async getNode(location: SessionLocation, nodeId: string): Promise<SessionNode | undefined> {
    const session = await this.getSession(location);
    if (!session) return undefined;
    return session.nodes.find((n) => n.id === nodeId);
  }

  async getLatestNode(
    location: SessionLocation,
    branch?: string
  ): Promise<SessionNode | undefined> {
    const session = await this.getSession(location);
    if (!session || session.nodes.length === 0) return undefined;

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
    if (!session) return undefined;

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
}
