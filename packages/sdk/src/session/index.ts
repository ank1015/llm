/**
 * Session module
 *
 * Exports session client for managing conversation sessions.
 */

export {
  sessionClient,
  DefaultSessionClient,
  type SessionClient,
  type ListProjectsResponse,
  type ListSessionsResponse,
  type SearchSessionsResponse,
  type CreateSessionResponse,
  type DeleteSessionResponse,
  type UpdateSessionNameResponse,
  type AppendMessageResponse,
  type AppendCustomResponse,
  type GetBranchesResponse,
  type GetBranchHistoryResponse,
  type GetLatestNodeResponse,
  type GetMessagesResponse,
} from './session-client.js';
