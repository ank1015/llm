/**
 * @ank1015/llm-sdk-adapters
 *
 * Node.js adapter implementations for @ank1015/llm-sdk.
 *
 * This package provides:
 * - File-based encrypted API key storage (FileKeysAdapter)
 * - JSONL file-based session storage (FileSessionsAdapter)
 * - In-memory adapters for testing (InMemoryKeysAdapter, InMemorySessionsAdapter)
 */

// File-based adapters (Node.js specific)
export { FileKeysAdapter, createFileKeysAdapter } from './file-system/file-keys.js';
export { FileSessionsAdapter, createFileSessionsAdapter } from './file-system/file-sessions.js';

// In-memory adapters (zero deps, for testing)
export { InMemoryKeysAdapter } from './memory/memory-keys.js';
export { InMemorySessionsAdapter } from './memory/memory-sessions.js';
