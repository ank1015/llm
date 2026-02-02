/**
 * Session types
 *
 * Defines types for session management with append-only JSONL storage.
 * Sessions form tree structures with branching support for conversation history.
 */

import type { Api } from './api.js';
import type { Message } from './message.js';

// ################################################################
//  Base Node
// ################################################################

/**
 * Base interface for all session nodes.
 * Every entry in a session file extends this interface.
 */
export interface BaseNode {
  /** Discriminator for node type */
  type: string;
  /** Unique identifier for this node (UUID) */
  id: string;
  /** Parent node ID, null only for session header */
  parentId: string | null;
  /** Branch name this node belongs to */
  branch: string;
  /** ISO 8601 timestamp of when this node was created */
  timestamp: string;
}

// ################################################################
//  Session Header
// ################################################################

/**
 * Session header node - always the first entry in a session file.
 * Contains metadata about the session itself.
 */
export interface SessionHeader extends BaseNode {
  type: 'session';
  /** Human-readable session name */
  sessionName: string;
  /** Always null for header (root of tree) */
  parentId: null;
  /** Header is always on main branch */
  branch: 'main';
}

// ################################################################
//  Message Node
// ################################################################

/**
 * Message node containing an LLM conversation message.
 * Stores the message along with provider context.
 */
export interface MessageNode extends BaseNode {
  type: 'message';
  /** The conversation message (user, assistant, toolResult, or custom) */
  message: Message;
  /** API provider used for this message context */
  api: Api;
  /** Model identifier used */
  modelId: string;
  /** Provider-specific options used for this message */
  providerOptions: Record<string, unknown>;
}

// ################################################################
//  Custom Node
// ################################################################

/**
 * Custom node for application-specific data.
 * Allows storing arbitrary metadata in the session tree.
 */
export interface CustomNode extends BaseNode {
  type: 'custom';
  /** Application-specific payload */
  payload: Record<string, unknown>;
}

// ################################################################
//  Union Types
// ################################################################

/**
 * Union of all possible session node types.
 */
export type SessionNode = SessionHeader | MessageNode | CustomNode;

/**
 * Union of nodes that can be appended after the header.
 * (Excludes SessionHeader since it's only at the start)
 */
export type AppendableNode = MessageNode | CustomNode;

// ################################################################
//  Session Metadata & Utilities
// ################################################################

/**
 * Session file location identifier.
 */
export interface SessionLocation {
  /** Project name (top-level directory) */
  projectName: string;
  /** Path within the project (can be nested, e.g., "chats/2024") */
  path: string;
  /** Session file ID (UUID, without .jsonl extension) */
  sessionId: string;
}

/**
 * Summary information about a session.
 * Used for listing sessions without loading full content.
 */
export interface SessionSummary {
  /** Session file ID */
  sessionId: string;
  /** Session name from header */
  sessionName: string;
  /** Full file path */
  filePath: string;
  /** Session creation timestamp */
  createdAt: string;
  /** Last modification timestamp */
  updatedAt: string;
  /** Total number of nodes in the session */
  nodeCount: number;
  /** Names of all branches in the session */
  branches: string[];
}

/**
 * Full session data with parsed nodes.
 */
export interface Session {
  /** Session location info */
  location: SessionLocation;
  /** Session header (first node) */
  header: SessionHeader;
  /** All nodes in the session (including header) */
  nodes: SessionNode[];
}

/**
 * Branch information within a session.
 */
export interface BranchInfo {
  /** Branch name */
  name: string;
  /** ID of the node where this branch starts */
  branchPointId: string | null;
  /** Number of nodes in this branch */
  nodeCount: number;
  /** ID of the latest node in this branch */
  latestNodeId: string;
}

// ################################################################
//  Input Types for Service Operations
// ################################################################

/**
 * Input for creating a new session.
 */
export interface CreateSessionInput {
  /** Project name */
  projectName: string;
  /** Path within project (optional, defaults to root) */
  path?: string;
  /** Session name (optional, defaults to generated name) */
  sessionName?: string;
}

/**
 * Input for appending a message node.
 */
export interface AppendMessageInput {
  /** Project name */
  projectName: string;
  /** Path within project */
  path: string;
  /** Session ID (if not provided, creates new session) */
  sessionId?: string;
  /** Parent node ID to attach this message to */
  parentId: string;
  /** Branch name */
  branch: string;
  /** The message to store */
  message: Message;
  /** API provider */
  api: Api;
  /** Model ID */
  modelId: string;
  /** Provider options */
  providerOptions?: Record<string, unknown>;
}

/**
 * Input for appending a custom node.
 */
export interface AppendCustomInput {
  /** Project name */
  projectName: string;
  /** Path within project */
  path: string;
  /** Session ID */
  sessionId: string;
  /** Parent node ID */
  parentId: string;
  /** Branch name */
  branch: string;
  /** Custom payload */
  payload: Record<string, unknown>;
}

/**
 * Input for updating session name.
 */
export interface UpdateSessionNameInput {
  /** Project name */
  projectName: string;
  /** Path within project */
  path: string;
  /** Session ID */
  sessionId: string;
  /** New session name */
  sessionName: string;
}
