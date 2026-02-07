/**
 * Adapter interfaces for SDK storage operations.
 *
 * These interfaces define the contract for storing and retrieving:
 * - API keys (KeysAdapter)
 * - Usage/analytics data (UsageAdapter)
 * - Conversation sessions (SessionsAdapter)
 */

import type { Api } from './api.js';
import type { BaseAssistantMessage } from './message.js';
import type {
  AppendCustomInput,
  AppendMessageInput,
  BranchInfo,
  CreateSessionInput,
  CustomNode,
  MessageNode,
  Session,
  SessionHeader,
  SessionLocation,
  SessionNode,
  SessionSummary,
} from './session.js';

// ################################################################
//  Keys Adapter
// ################################################################

/**
 * Adapter for managing API keys.
 */
export interface KeysAdapter {
  /**
   * Get the API key for a provider.
   * @param api - The API provider
   * @returns The API key, or undefined if not found
   */
  get(api: Api): Promise<string | undefined>;

  /**
   * Get all stored credentials for a provider.
   *
   * Optional method for providers that require multiple credential fields
   * (e.g. claude-code needs oauthToken, betaFlag, billingHeader).
   *
   * @param api - The API provider
   * @returns Credential map, or undefined if not found
   */
  getCredentials?(api: Api): Promise<Record<string, string> | undefined>;

  /**
   * Set the API key for a provider.
   * @param api - The API provider
   * @param key - The API key to store
   */
  set(api: Api, key: string): Promise<void>;

  /**
   * Set all credentials for a provider.
   *
   * Optional method for providers that require multiple credential fields.
   *
   * @param api - The API provider
   * @param credentials - Credential map to store
   */
  setCredentials?(api: Api, credentials: Record<string, string>): Promise<void>;

  /**
   * Delete the API key for a provider.
   * @param api - The API provider
   * @returns true if deleted, false if not found
   */
  delete(api: Api): Promise<boolean>;

  /**
   * Delete all credentials for a provider.
   *
   * Optional method for providers that store multiple credential fields.
   *
   * @param api - The API provider
   * @returns true if deleted, false if not found
   */
  deleteCredentials?(api: Api): Promise<boolean>;

  /**
   * List all providers with stored keys.
   * @returns Array of provider names
   */
  list(): Promise<Api[]>;
}

// ################################################################
//  Usage Adapter
// ################################################################

/**
 * Filter options for usage queries.
 */
export interface UsageFilters {
  api?: Api;
  modelId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

/**
 * Token breakdown structure.
 */
export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/**
 * Cost breakdown structure.
 */
export interface CostBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/**
 * Usage statistics result.
 */
export interface UsageStats {
  totalMessages: number;
  tokens: TokenBreakdown;
  cost: CostBreakdown;
  byApi: Record<
    string,
    {
      messages: number;
      tokens: TokenBreakdown;
      cost: CostBreakdown;
    }
  >;
  byModel: Record<
    string,
    {
      api: string;
      modelName: string;
      messages: number;
      tokens: TokenBreakdown;
      cost: CostBreakdown;
    }
  >;
}

/**
 * Adapter for tracking LLM usage and costs.
 */
export interface UsageAdapter {
  /**
   * Track a message's usage.
   * @param message - The assistant message to track
   */
  track<TApi extends Api>(message: BaseAssistantMessage<TApi>): Promise<void>;

  /**
   * Get usage statistics.
   * @param filters - Optional filters
   * @returns Aggregated usage statistics
   */
  getStats(filters?: UsageFilters): Promise<UsageStats>;

  /**
   * Get a message by ID.
   * @param id - The message ID
   * @returns The message or undefined
   */
  getMessage<TApi extends Api>(id: string): Promise<BaseAssistantMessage<TApi> | undefined>;

  /**
   * Get messages with optional filters.
   * @param filters - Filter options
   * @returns Array of messages
   */
  getMessages<TApi extends Api>(filters?: UsageFilters): Promise<BaseAssistantMessage<TApi>[]>;

  /**
   * Delete a message by ID.
   * @param id - The message ID
   * @returns true if deleted, false if not found
   */
  deleteMessage(id: string): Promise<boolean>;
}

// ################################################################
//  Sessions Adapter
// ################################################################

/**
 * Adapter for managing conversation sessions.
 */
export interface SessionsAdapter {
  /**
   * Create a new session.
   * @param input - Session creation input
   * @returns The session ID and header
   */
  createSession(input: CreateSessionInput): Promise<{ sessionId: string; header: SessionHeader }>;

  /**
   * Get a session by location.
   * @param location - Session location
   * @returns The session or undefined
   */
  getSession(location: SessionLocation): Promise<Session | undefined>;

  /**
   * Delete a session.
   * @param location - Session location
   * @returns true if deleted, false if not found
   */
  deleteSession(location: SessionLocation): Promise<boolean>;

  /**
   * Update the session name.
   * @param location - Session location
   * @param sessionName - New session name
   * @returns The updated header or undefined
   */
  updateSessionName(
    location: SessionLocation,
    sessionName: string
  ): Promise<SessionHeader | undefined>;

  /**
   * List all sessions in a project.
   * @param projectName - Project name
   * @param path - Optional path within project
   * @returns Array of session summaries
   */
  listSessions(projectName: string, path?: string): Promise<SessionSummary[]>;

  /**
   * List all projects.
   * @returns Array of project names
   */
  listProjects(): Promise<string[]>;

  /**
   * Append a message to a session.
   * @param input - Message input
   * @returns The session ID and created node
   */
  appendMessage(input: AppendMessageInput): Promise<{ sessionId: string; node: MessageNode }>;

  /**
   * Append a custom node to a session.
   * @param input - Custom node input
   * @returns The created node or undefined
   */
  appendCustom(input: AppendCustomInput): Promise<CustomNode | undefined>;

  /**
   * Get branch information for a session.
   * @param location - Session location
   * @returns Array of branch info or undefined
   */
  getBranches(location: SessionLocation): Promise<BranchInfo[] | undefined>;

  /**
   * Get the linear history of a branch.
   * @param location - Session location
   * @param branch - Branch name
   * @returns Array of nodes or undefined
   */
  getBranchHistory(location: SessionLocation, branch: string): Promise<SessionNode[] | undefined>;

  /**
   * Get a specific node by ID.
   * @param location - Session location
   * @param nodeId - Node ID
   * @returns The node or undefined
   */
  getNode(location: SessionLocation, nodeId: string): Promise<SessionNode | undefined>;

  /**
   * Get the latest node in a session.
   * @param location - Session location
   * @param branch - Optional branch filter
   * @returns The latest node or undefined
   */
  getLatestNode(location: SessionLocation, branch?: string): Promise<SessionNode | undefined>;

  /**
   * Get all message nodes from a session.
   * @param location - Session location
   * @param branch - Optional branch filter
   * @returns Array of message nodes or undefined
   */
  getMessages(location: SessionLocation, branch?: string): Promise<MessageNode[] | undefined>;

  /**
   * Search sessions by name.
   * @param projectName - Project name
   * @param query - Search query
   * @param path - Optional path
   * @returns Array of matching session summaries
   */
  searchSessions(projectName: string, query: string, path?: string): Promise<SessionSummary[]>;
}
