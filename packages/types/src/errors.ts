/**
 * Error types for LLM SDK
 */

/**
 * Error codes for LLM errors.
 */
export type LLMErrorCode =
  | 'API_KEY_NOT_FOUND'
  | 'COST_LIMIT'
  | 'CONTEXT_LIMIT'
  | 'CONVERSATION_BUSY'
  | 'MODEL_NOT_CONFIGURED'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_PARENT'
  | 'PATH_TRAVERSAL';

/**
 * Base class for LLM errors.
 */
export class LLMError extends Error {
  readonly code: LLMErrorCode;

  constructor(code: LLMErrorCode, message: string) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
  }
}

/**
 * API key not found for the requested provider.
 */
export class ApiKeyNotFoundError extends LLMError {
  constructor(provider: string) {
    super('API_KEY_NOT_FOUND', `API key not found for provider: ${provider}`);
    this.name = 'ApiKeyNotFoundError';
  }
}

export class CostLimitError extends LLMError {
  constructor(currentCost: number, limit: number) {
    super('COST_LIMIT', `Cost limit exceeded: ${currentCost} >= ${limit}`);
    this.name = 'CostLimitError';
  }
}

export class ContextLimitError extends LLMError {
  constructor(inputTokens: number, limit: number) {
    super('CONTEXT_LIMIT', `Context limit exceeded: ${inputTokens} >= ${limit}`);
    this.name = 'ContextLimitError';
  }
}

export class ConversationBusyError extends LLMError {
  constructor() {
    super('CONVERSATION_BUSY', 'Cannot start a new prompt while another is running');
    this.name = 'ConversationBusyError';
  }
}

export class ModelNotConfiguredError extends LLMError {
  constructor() {
    super('MODEL_NOT_CONFIGURED', 'No provider configured. Call setProvider() before prompt().');
    this.name = 'ModelNotConfiguredError';
  }
}

export class SessionNotFoundError extends LLMError {
  constructor(sessionId: string) {
    super('SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class InvalidParentError extends LLMError {
  constructor(parentId: string, sessionId: string) {
    super('INVALID_PARENT', `Parent node '${parentId}' not found in session '${sessionId}'`);
    this.name = 'InvalidParentError';
  }
}

export class PathTraversalError extends LLMError {
  constructor(path: string) {
    super('PATH_TRAVERSAL', `Path component '${path}' contains invalid traversal characters`);
    this.name = 'PathTraversalError';
  }
}
