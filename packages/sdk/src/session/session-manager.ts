/**
 * Session Manager
 *
 * Provides a convenient interface for managing conversation sessions
 * using a SessionsAdapter.
 */

import type { SessionsAdapter, SessionLocation } from '../adapters/types.js';
import type {
  AppendCustomInput,
  AppendMessageInput,
  BranchInfo,
  CreateSessionInput,
  CustomNode,
  MessageNode,
  Session,
  SessionHeader,
  SessionNode,
  SessionSummary,
} from '@ank1015/llm-types';

/**
 * Session Manager provides a clean interface for session operations.
 */
export class SessionManager {
  constructor(private adapter: SessionsAdapter) {}

  /**
   * Create a new session.
   */
  async createSession(
    input: CreateSessionInput
  ): Promise<{ sessionId: string; header: SessionHeader }> {
    return this.adapter.createSession(input);
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
    input: AppendMessageInput
  ): Promise<{ sessionId: string; node: MessageNode }> {
    return this.adapter.appendMessage(input);
  }

  /**
   * Append a custom node to a session.
   */
  async appendCustom(input: AppendCustomInput): Promise<CustomNode | undefined> {
    return this.adapter.appendCustom(input);
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
