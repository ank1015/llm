/**
 * Session Client
 *
 * Type-safe client for the sessions REST API.
 * Provides methods for all session management operations.
 */

import { LLMError } from '@ank1015/llm-types';

import { getServerUrl } from '../config.js';

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

// ################################################################
//  Response Types (from server)
// ################################################################

/** Response from listing projects */
export interface ListProjectsResponse {
  projects: string[];
  count: number;
}

/** Response from listing sessions */
export interface ListSessionsResponse {
  projectName: string;
  path: string;
  sessions: SessionSummary[];
  count: number;
}

/** Response from searching sessions */
export interface SearchSessionsResponse {
  projectName: string;
  path: string;
  query: string;
  sessions: SessionSummary[];
  count: number;
}

/** Response from creating a session */
export interface CreateSessionResponse {
  success: boolean;
  sessionId: string;
  header: SessionHeader;
  location: {
    projectName: string;
    path: string;
    sessionId: string;
  };
}

/** Response from deleting a session */
export interface DeleteSessionResponse {
  success: boolean;
  message: string;
  location: {
    projectName: string;
    path: string;
    sessionId: string;
  };
}

/** Response from updating session name */
export interface UpdateSessionNameResponse {
  success: boolean;
  header: SessionHeader;
  location: {
    projectName: string;
    path: string;
    sessionId: string;
  };
}

/** Response from appending a message */
export interface AppendMessageResponse {
  success: boolean;
  sessionId: string;
  node: MessageNode;
  location: {
    projectName: string;
    path: string;
    sessionId: string;
  };
}

/** Response from appending a custom node */
export interface AppendCustomResponse {
  success: boolean;
  node: CustomNode;
  location: {
    projectName: string;
    path: string;
    sessionId: string;
  };
}

/** Response from getting branches */
export interface GetBranchesResponse {
  sessionId: string;
  branches: BranchInfo[];
  count: number;
}

/** Response from getting branch history */
export interface GetBranchHistoryResponse {
  sessionId: string;
  branch: string;
  history: SessionNode[];
  count: number;
}

/** Response from getting latest node */
export interface GetLatestNodeResponse {
  sessionId: string;
  branch: string;
  node: SessionNode;
}

/** Response from getting messages */
export interface GetMessagesResponse {
  sessionId: string;
  branch: string | null;
  messages: MessageNode[];
  count: number;
}

/** Error response from server */
interface ErrorResponse {
  error: true;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ################################################################
//  Session Client Interface
// ################################################################

/**
 * Interface for session client operations.
 * Allows dependency injection and testing.
 */
export interface SessionClient {
  // Project operations
  listProjects(): Promise<ListProjectsResponse>;

  // Session listing operations
  listSessions(projectName: string, path?: string): Promise<ListSessionsResponse>;
  searchSessions(
    projectName: string,
    query: string,
    path?: string
  ): Promise<SearchSessionsResponse>;

  // Session CRUD operations
  createSession(
    projectName: string,
    path?: string,
    sessionName?: string
  ): Promise<CreateSessionResponse>;
  getSession(projectName: string, sessionId: string, path?: string): Promise<Session>;
  deleteSession(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<DeleteSessionResponse>;
  updateSessionName(
    projectName: string,
    sessionId: string,
    sessionName: string,
    path?: string
  ): Promise<UpdateSessionNameResponse>;

  // Node operations
  appendMessage(
    projectName: string,
    sessionId: string,
    parentId: string,
    branch: string,
    message: Message,
    api: Api,
    modelId: string,
    providerOptions?: Record<string, unknown>,
    path?: string
  ): Promise<AppendMessageResponse>;
  appendCustom(
    projectName: string,
    sessionId: string,
    parentId: string,
    branch: string,
    payload: Record<string, unknown>,
    path?: string
  ): Promise<AppendCustomResponse>;

  // Query operations
  getBranches(projectName: string, sessionId: string, path?: string): Promise<GetBranchesResponse>;
  getBranchHistory(
    projectName: string,
    sessionId: string,
    branch: string,
    path?: string
  ): Promise<GetBranchHistoryResponse>;
  getNode(
    projectName: string,
    sessionId: string,
    nodeId: string,
    path?: string
  ): Promise<SessionNode>;
  getLatestNode(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<GetLatestNodeResponse>;
  getMessages(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<GetMessagesResponse>;
}

// ################################################################
//  Helper Functions
// ################################################################

/**
 * Build URL with optional query parameters.
 */
function buildUrl(basePath: string, params?: Record<string, string | undefined>): string {
  const serverUrl = getServerUrl();
  const url = new URL(`${serverUrl}${basePath}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

/**
 * Handle response errors.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new LLMError(
      (errorData.code as 'PROVIDER_ERROR') || 'PROVIDER_ERROR',
      errorData.message || `Request failed with status ${response.status}`,
      response.status,
      errorData.details
    );
  }

  return response.json() as Promise<T>;
}

// ################################################################
//  Default Session Client Implementation
// ################################################################

/**
 * Default implementation of SessionClient.
 * Makes HTTP requests to the session REST API.
 */
export class DefaultSessionClient implements SessionClient {
  // ============================================================
  // Project Operations
  // ============================================================

  async listProjects(): Promise<ListProjectsResponse> {
    const url = buildUrl('/sessions/projects');
    const response = await fetch(url);
    return handleResponse<ListProjectsResponse>(response);
  }

  // ============================================================
  // Session Listing Operations
  // ============================================================

  async listSessions(projectName: string, path?: string): Promise<ListSessionsResponse> {
    const url = buildUrl(`/sessions/${encodeURIComponent(projectName)}`, { path });
    const response = await fetch(url);
    return handleResponse<ListSessionsResponse>(response);
  }

  async searchSessions(
    projectName: string,
    query: string,
    path?: string
  ): Promise<SearchSessionsResponse> {
    const url = buildUrl(`/sessions/${encodeURIComponent(projectName)}/search`, { path, q: query });
    const response = await fetch(url);
    return handleResponse<SearchSessionsResponse>(response);
  }

  // ============================================================
  // Session CRUD Operations
  // ============================================================

  async createSession(
    projectName: string,
    path?: string,
    sessionName?: string
  ): Promise<CreateSessionResponse> {
    const url = buildUrl(`/sessions/${encodeURIComponent(projectName)}`, { path });

    const options: RequestInit = { method: 'POST' };

    if (sessionName) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ sessionName });
    }

    const response = await fetch(url, options);

    return handleResponse<CreateSessionResponse>(response);
  }

  async getSession(projectName: string, sessionId: string, path?: string): Promise<Session> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`,
      { path }
    );
    const response = await fetch(url);
    return handleResponse<Session>(response);
  }

  async deleteSession(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<DeleteSessionResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`,
      { path }
    );
    const response = await fetch(url, { method: 'DELETE' });
    return handleResponse<DeleteSessionResponse>(response);
  }

  async updateSessionName(
    projectName: string,
    sessionId: string,
    sessionName: string,
    path?: string
  ): Promise<UpdateSessionNameResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`,
      { path }
    );
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionName }),
    });
    return handleResponse<UpdateSessionNameResponse>(response);
  }

  // ============================================================
  // Node Operations
  // ============================================================

  async appendMessage(
    projectName: string,
    sessionId: string,
    parentId: string,
    branch: string,
    message: Message,
    api: Api,
    modelId: string,
    providerOptions?: Record<string, unknown>,
    path?: string
  ): Promise<AppendMessageResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/messages`,
      { path }
    );

    const body: Record<string, unknown> = {
      parentId,
      branch,
      message,
      api,
      modelId,
    };

    if (providerOptions) {
      body.providerOptions = providerOptions;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return handleResponse<AppendMessageResponse>(response);
  }

  async appendCustom(
    projectName: string,
    sessionId: string,
    parentId: string,
    branch: string,
    payload: Record<string, unknown>,
    path?: string
  ): Promise<AppendCustomResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/custom`,
      { path }
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId, branch, payload }),
    });

    return handleResponse<AppendCustomResponse>(response);
  }

  // ============================================================
  // Query Operations
  // ============================================================

  async getBranches(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<GetBranchesResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/branches`,
      { path }
    );
    const response = await fetch(url);
    return handleResponse<GetBranchesResponse>(response);
  }

  async getBranchHistory(
    projectName: string,
    sessionId: string,
    branch: string,
    path?: string
  ): Promise<GetBranchHistoryResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/history/${encodeURIComponent(branch)}`,
      { path }
    );
    const response = await fetch(url);
    return handleResponse<GetBranchHistoryResponse>(response);
  }

  async getNode(
    projectName: string,
    sessionId: string,
    nodeId: string,
    path?: string
  ): Promise<SessionNode> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/nodes/${encodeURIComponent(nodeId)}`,
      { path }
    );
    const response = await fetch(url);
    return handleResponse<SessionNode>(response);
  }

  async getLatestNode(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<GetLatestNodeResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/latest`,
      { path, branch }
    );
    const response = await fetch(url);
    return handleResponse<GetLatestNodeResponse>(response);
  }

  async getMessages(
    projectName: string,
    sessionId: string,
    branch?: string,
    path?: string
  ): Promise<GetMessagesResponse> {
    const url = buildUrl(
      `/sessions/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}/messages`,
      { path, branch }
    );
    const response = await fetch(url);
    return handleResponse<GetMessagesResponse>(response);
  }
}

// ################################################################
//  Singleton Instance
// ################################################################

/**
 * Default session client instance.
 * Use this for convenience, or create your own instance for testing.
 */
export const sessionClient = new DefaultSessionClient();
