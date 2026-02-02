/**
 * Error types for LLM SDK
 */

/**
 * Error codes for LLM errors.
 */
export type LLMErrorCode = 'API_KEY_NOT_FOUND';

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
