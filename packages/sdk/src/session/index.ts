/**
 * Session module
 *
 * Exports session manager for managing conversation sessions.
 */

export { SessionManager, createSessionManager } from './session-manager.js';
export type {
  CreateSessionOptions,
  AppendMessageOptions,
  AppendCustomOptions,
} from './session-manager.js';
