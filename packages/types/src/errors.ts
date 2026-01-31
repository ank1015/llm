/**
 * Error types for LLM API
 */

/**
 * Error codes for LLM API errors.
 */
export type LLMErrorCode =
	| "API_KEY_NOT_FOUND"
	| "MODEL_NOT_FOUND"
	| "INVALID_REQUEST"
	| "PROVIDER_ERROR"
	| "RATE_LIMIT"
	| "CONTEXT_OVERFLOW"
	| "STREAM_ERROR"
	| "INTERNAL_ERROR";

/**
 * Structured error response from the API.
 */
export interface LLMErrorResponse {
	/** Error indicator */
	error: true;
	/** Error code for programmatic handling */
	code: LLMErrorCode;
	/** Human-readable error message */
	message: string;
	/** Additional error details */
	details?: Record<string, unknown> | undefined;
}

/**
 * Base class for LLM API errors.
 */
export class LLMError extends Error {
	readonly code: LLMErrorCode;
	readonly statusCode: number;
	readonly details?: Record<string, unknown> | undefined;

	constructor(code: LLMErrorCode, message: string, statusCode = 500, details?: Record<string, unknown>) {
		super(message);
		this.name = "LLMError";
		this.code = code;
		this.statusCode = statusCode;
		this.details = details;
	}

	/**
	 * Convert to error response object.
	 */
	toResponse(): LLMErrorResponse {
		const response: LLMErrorResponse = {
			error: true,
			code: this.code,
			message: this.message,
		};
		if (this.details !== undefined) {
			response.details = this.details;
		}
		return response;
	}
}

/**
 * API key not found for the requested provider.
 */
export class ApiKeyNotFoundError extends LLMError {
	constructor(provider: string) {
		super("API_KEY_NOT_FOUND", `API key not found for provider: ${provider}`, 401, { provider });
		this.name = "ApiKeyNotFoundError";
	}
}

/**
 * Requested model not found.
 */
export class ModelNotFoundError extends LLMError {
	constructor(api: string, modelId: string) {
		super("MODEL_NOT_FOUND", `Model not found: ${modelId} for provider ${api}`, 404, { api, modelId });
		this.name = "ModelNotFoundError";
	}
}

/**
 * Invalid request parameters.
 */
export class InvalidRequestError extends LLMError {
	constructor(message: string, details?: Record<string, unknown>) {
		super("INVALID_REQUEST", message, 400, details);
		this.name = "InvalidRequestError";
	}
}

/**
 * Error from the LLM provider.
 */
export class ProviderError extends LLMError {
	constructor(provider: string, message: string, details?: Record<string, unknown>) {
		super("PROVIDER_ERROR", `${provider} error: ${message}`, 502, { provider, ...details });
		this.name = "ProviderError";
	}
}

/**
 * Rate limit exceeded.
 */
export class RateLimitError extends LLMError {
	constructor(provider: string, retryAfter?: number) {
		super("RATE_LIMIT", `Rate limit exceeded for ${provider}`, 429, { provider, retryAfter });
		this.name = "RateLimitError";
	}
}

/**
 * Context overflow error.
 */
export class ContextOverflowError extends LLMError {
	constructor(provider: string, tokenCount?: number, maxTokens?: number) {
		super("CONTEXT_OVERFLOW", `Context overflow for ${provider}`, 413, { provider, tokenCount, maxTokens });
		this.name = "ContextOverflowError";
	}
}

/**
 * Stream error.
 */
export class StreamError extends LLMError {
	constructor(message: string, details?: Record<string, unknown>) {
		super("STREAM_ERROR", message, 500, details);
		this.name = "StreamError";
	}
}
