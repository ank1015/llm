/**
 * @ank1015/llm-core
 *
 * Core SDK for LLM interactions.
 */

export const VERSION = '0.0.4';

// Models
export { MODELS, getProviders, getModel, getModels, calculateCost } from './models/index.js';

// Utilities
export {
  EventStream,
  AssistantMessageEventStream,
  parseStreamingJson,
  isContextOverflow,
  getOverflowPatterns,
  sanitizeSurrogates,
  validateToolCall,
  validateToolArguments,
  generateUUID,
} from './utils/index.js';
export type { CompleteFunction, StreamFunction } from './utils/index.js';

// Providers
export * from './providers/anthropic/index.js';
export * from './providers/claude-code/index.js';
export * from './providers/codex/index.js';
export * from './providers/openai/index.js';
export * from './providers/google/index.js';
export * from './providers/deepseek/index.js';
export * from './providers/zai/index.js';
export * from './providers/kimi/index.js';
export * from './providers/minimax/index.js';
export * from './providers/cerebras/index.js';
export * from './providers/openrouter/index.js';

// LLM - Central entry point (dispatches to providers)
export { complete, stream } from './llm/index.js';

// Provider registry - for custom providers
export { registerProvider } from './providers/registry.js';
export type { ProviderRegistration, MockMessageFactory } from './providers/registry.js';

// Agent - Stateless agent loop and utilities
export {
  runAgentLoop,
  buildUserMessage,
  buildToolResultMessage,
  getMockMessage,
} from './agent/index.js';
export type {
  AgentCompleteFunction,
  AgentStreamFunction,
  AgentRunnerConfig,
  AgentRunnerCallbacks,
  AgentEventEmitter,
  AgentRunnerResult,
} from './agent/index.js';

// Re-export types from @ank1015/llm-types for convenience
export type * from '@ank1015/llm-types';
