/**
 * Adapters for SDK storage operations.
 *
 * This module exports adapter interfaces and types only.
 * For concrete implementations (FileKeysAdapter, FileSessionsAdapter, etc.),
 * use @ank1015/llm-sdk-adapters.
 */

// Types
export type {
  KeysAdapter,
  SessionsAdapter,
  CreateSessionInput,
  AppendMessageInput,
  AppendCustomInput,
  SessionLocation,
} from '@ank1015/llm-types';
