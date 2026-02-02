/**
 * Agent module - stateless agent loop and utilities
 */

// Main runner function
export { runAgentLoop } from './runner.js';

// Message building utilities
export { buildUserMessage, buildToolResultMessage } from './utils.js';

// Mock message generator
export { getMockMessage } from './mock.js';

// Types
export type {
  AgentCompleteFunction,
  AgentStreamFunction,
  AgentRunnerConfig,
  AgentRunnerCallbacks,
  AgentEventEmitter,
  AgentRunnerResult,
} from './types.js';
