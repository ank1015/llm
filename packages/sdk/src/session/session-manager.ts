/**
 * Session Manager
 *
 * Provides a convenient interface for managing conversation sessions
 * using a SessionsAdapter.
 */

import type { SessionsAdapter, SessionLocation } from '../adapters/types.js';
import type {
  BranchInfo,
  CustomNode,
  Message,
  MessageNode,
  Session,
  SessionHeader,
  SessionNode,
  SessionSummary,
  Api,
} from '@ank1015/llm-types';

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  projectName: string;
  path?: string;
  sessionName?: string;
}

/**
 * Options for appending a message.
 */
export interface AppendMessageOptions {
  projectName: string;
  sessionId: string;
  parentId: string;
  branch: string;
  message: Message;
  api: Api;
  modelId: string;
  path?: string;
  providerOptions?: Record<string, unknown>;
}

/**
 * Options for appending a custom node.
 */
export interface AppendCustomOptions {
  projectName: string;
  sessionId: string;
  parentId: string;
  branch: string;
  payload: Record<string, unknown>;
  path?: string;
}

/**
 * Session Manager provides a clean interface for session operations.
 */
export class SessionManager {
  constructor(private adapter: SessionsAdapter) {}

  /**
   * Create a new session.
   */
  async createSession(
    options: CreateSessionOptions
  ): Promise<{ sessionId: string; header: SessionHeader }> {
    return this.adapter.createSession(options);
  }

  /**
   * Get a session by ID.
   */
  async getSession(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<Session | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.getSession(location);
  }

  /**
   * Delete a session.
   */
  async deleteSession(projectName: string, sessionId: string, path?: string): Promise<boolean> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.deleteSession(location);
  }

  /**
   * Update the session name.
   */
  async updateSessionName(
    projectName: string,
    sessionId: string,
    sessionName: string,
    path?: string
  ): Promise<SessionHeader | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.updateSessionName(location, sessionName);
  }

  /**
   * List all sessions in a project.
   */
  async listSessions(projectName: string, path?: string): Promise<SessionSummary[]> {
    return this.adapter.listSessions(projectName, path);
  }

  /**
   * List all projects.
   */
  async listProjects(): Promise<string[]> {
    return this.adapter.listProjects();
  }

  /**
   * Append a message to a session.
   */
  async appendMessage(
    options: AppendMessageOptions
  ): Promise<{ sessionId: string; node: MessageNode }> {
    return this.adapter.appendMessage({
      projectName: options.projectName,
      path: options.path ?? '',
      sessionId: options.sessionId,
      parentId: options.parentId,
      branch: options.branch,
      message: options.message,
      api: options.api,
      modelId: options.modelId,
      providerOptions: options.providerOptions ?? {},
    });
  }

  /**
   * Append a custom node to a session.
   */
  async appendCustom(options: AppendCustomOptions): Promise<CustomNode | undefined> {
    return this.adapter.appendCustom({
      projectName: options.projectName,
      path: options.path ?? '',
      sessionId: options.sessionId,
      parentId: options.parentId,
      branch: options.branch,
      payload: options.payload,
    });
  }

  /**
   * Get branch information for a session.
   */
  async getBranches(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<BranchInfo[] | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.getBranches(location);
  }

  /**
   * Get the linear history of a branch.
   */
  async getBranchHistory(
    projectName: string,
    sessionId: string,
    branch: string,
    path?: string
  ): Promise<SessionNode[] | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.getBranchHistory(location, branch);
  }

  /**
   * Get a specific node by ID.
   */
  async getNode(
    projectName: string,
    sessionId: string,
    nodeId: string,
    path?: string
  ): Promise<SessionNode | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.getNode(location, nodeId);
  }

  /**
   * Get the latest node in a session.
   */
  async getLatestNode(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<SessionNode | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.getLatestNode(location, branch);
  }

  /**
   * Get all message nodes from a session.
   */
  async getMessages(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<MessageNode[] | undefined> {
    const location: SessionLocation = { projectName, sessionId, path: path ?? '' };
    return this.adapter.getMessages(location, branch);
  }

  /**
   * Search sessions by name.
   */
  async searchSessions(
    projectName: string,
    query: string,
    path?: string
  ): Promise<SessionSummary[]> {
    return this.adapter.searchSessions(projectName, query, path);
  }
}

/**
 * Create a SessionManager with the given adapter.
 */
export function createSessionManager(adapter: SessionsAdapter): SessionManager {
  return new SessionManager(adapter);
}
