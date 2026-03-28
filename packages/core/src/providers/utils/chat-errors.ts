import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from 'openai/error';

import type { AssistantError } from '../../types/index.js';

interface OpenAICompatibleRetryConfig {
  retryableStatusCodes?: readonly number[];
  retryableStatusRanges?: readonly (readonly [number, number])[];
  retryableCodes?: readonly (string | number)[];
  retryableTypes?: readonly string[];
  retryableMessagePatterns?: readonly RegExp[];
  nonRetryableCodes?: readonly (string | number)[];
  nonRetryableTypes?: readonly string[];
  nonRetryableMessagePatterns?: readonly RegExp[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().toLowerCase();
}

function getOpenAIErrorPayload(error: APIError): Record<string, unknown> | undefined {
  return isObject(error.error) ? error.error : undefined;
}

function getOpenAIErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const payload = getOpenAIErrorPayload(error);
    if (payload && typeof payload.message === 'string') {
      return payload.message;
    }
  }

  if (isObject(error)) {
    if (typeof error.message === 'string') {
      return error.message;
    }

    if (isObject(error.error) && typeof error.error.message === 'string') {
      return error.error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function getOpenAIErrorCode(error: unknown): string | number | undefined {
  if (error instanceof APIError) {
    if (error.code !== undefined && error.code !== null) {
      return error.code;
    }

    const payload = getOpenAIErrorPayload(error);
    const code = payload?.code;
    return typeof code === 'string' || typeof code === 'number' ? code : undefined;
  }

  if (isObject(error)) {
    const code = error.code;
    if (typeof code === 'string' || typeof code === 'number') {
      return code;
    }

    if (isObject(error.error)) {
      const nestedCode = error.error.code;
      if (typeof nestedCode === 'string' || typeof nestedCode === 'number') {
        return nestedCode;
      }
    }
  }

  return undefined;
}

function getOpenAIErrorType(error: unknown): string | undefined {
  if (error instanceof APIError) {
    if (typeof error.type === 'string') {
      return error.type;
    }

    const payload = getOpenAIErrorPayload(error);
    return typeof payload?.type === 'string' ? payload.type : undefined;
  }

  if (isObject(error)) {
    if (typeof error.type === 'string') {
      return error.type;
    }

    if (isObject(error.error) && typeof error.error.type === 'string') {
      return error.error.type;
    }
  }

  return undefined;
}

function getOpenAIErrorStatus(error: unknown): number | undefined {
  if (error instanceof APIError) {
    return error.status ?? getNumericStatusCandidate(getOpenAIErrorCode(error)) ?? undefined;
  }

  if (isObject(error)) {
    return (
      getNumericStatusCandidate(error.status) ??
      getNumericStatusCandidate(getOpenAIErrorCode(error)) ??
      undefined
    );
  }

  return undefined;
}

function getNumericStatusCandidate(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) {
    return value;
  }

  if (typeof value === 'string' && /^\d{3}$/.test(value)) {
    const parsed = Number(value);
    if (parsed >= 100 && parsed <= 599) {
      return parsed;
    }
  }

  return undefined;
}

function matchesConfiguredValues(
  actual: string | undefined,
  expected: readonly (string | number)[] | readonly string[] | undefined
): boolean {
  if (!actual || !expected || expected.length === 0) return false;

  return expected.some((value) => normalizeValue(value) === actual);
}

function matchesMessagePatterns(
  message: string,
  patterns: readonly RegExp[] | undefined
): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => pattern.test(message));
}

function matchesRetryableStatus(
  status: number | undefined,
  config: OpenAICompatibleRetryConfig
): boolean {
  if (status === undefined) return false;

  if (config.retryableStatusCodes?.includes(status)) {
    return true;
  }

  return (
    config.retryableStatusRanges?.some(([min, max]) => status >= min && status <= max) ?? false
  );
}

export function canRetryOpenAICompatibleError(
  error: unknown,
  config: OpenAICompatibleRetryConfig
): boolean {
  if (error instanceof APIUserAbortError) {
    return false;
  }

  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return true;
  }

  const message = getOpenAIErrorMessage(error);

  if (error instanceof APIError) {
    const code = normalizeValue(getOpenAIErrorCode(error));
    const type = normalizeValue(getOpenAIErrorType(error));
    const status = getOpenAIErrorStatus(error);

    if (
      matchesConfiguredValues(code, config.nonRetryableCodes) ||
      matchesConfiguredValues(type, config.nonRetryableTypes) ||
      matchesMessagePatterns(message, config.nonRetryableMessagePatterns)
    ) {
      return false;
    }

    if (
      matchesConfiguredValues(code, config.retryableCodes) ||
      matchesConfiguredValues(type, config.retryableTypes) ||
      matchesMessagePatterns(message, config.retryableMessagePatterns)
    ) {
      return true;
    }

    return matchesRetryableStatus(status, config);
  }

  const code = normalizeValue(getOpenAIErrorCode(error));
  const type = normalizeValue(getOpenAIErrorType(error));
  const status = getOpenAIErrorStatus(error);

  if (
    matchesConfiguredValues(code, config.nonRetryableCodes) ||
    matchesConfiguredValues(type, config.nonRetryableTypes) ||
    matchesMessagePatterns(message, config.nonRetryableMessagePatterns)
  ) {
    return false;
  }

  if (
    matchesConfiguredValues(code, config.retryableCodes) ||
    matchesConfiguredValues(type, config.retryableTypes) ||
    matchesMessagePatterns(message, config.retryableMessagePatterns)
  ) {
    return true;
  }

  if (matchesRetryableStatus(status, config)) {
    return true;
  }

  return matchesMessagePatterns(message, config.retryableMessagePatterns);
}

export function getOpenAICompatibleErrorDetails(
  error: unknown,
  config: OpenAICompatibleRetryConfig
): AssistantError {
  return {
    message: getOpenAIErrorMessage(error),
    canRetry: canRetryOpenAICompatibleError(error, config),
  };
}

const genericRetryableCodes = ['server_error', 'rate_limit_exceeded', 'timeout', 'timeout_error'];
const genericRetryableMessages = [
  /timed out/i,
  /timeout/i,
  /provider disconnected/i,
  /server error/i,
  /internal server error/i,
  /service unavailable/i,
  /server overloaded/i,
];

const cerebrasRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [408, 429],
  retryableStatusRanges: [[500, 599]],
  retryableCodes: genericRetryableCodes,
  retryableMessagePatterns: genericRetryableMessages,
};

const deepseekRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [429],
  retryableStatusRanges: [[500, 599]],
  retryableCodes: genericRetryableCodes,
  retryableMessagePatterns: [...genericRetryableMessages, /server overloaded/i],
};

const kimiRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [429],
  retryableStatusRanges: [[500, 599]],
  retryableCodes: genericRetryableCodes,
  retryableMessagePatterns: genericRetryableMessages,
  nonRetryableTypes: ['exceeded_current_quota_error', 'content_filter'],
  nonRetryableMessagePatterns: [
    /exceeded current quota/i,
    /\bquota\b/i,
    /\bbilling\b/i,
    /\bnot active\b/i,
    /\binactive\b/i,
    /\bsuspend/i,
    /\bplan\b/i,
    /\bcontent restrictions?\b/i,
    /\bhigh risk\b/i,
  ],
};

const openRouterRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [408, 429, 502, 503],
  retryableCodes: [...genericRetryableCodes, 408, 429, 502, 503],
  retryableMessagePatterns: genericRetryableMessages,
};

const zaiRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [500],
  retryableCodes: ['1120', '1234', '1302', '1303', '1305', '1312'],
  retryableMessagePatterns: [...genericRetryableMessages, /try again later/i],
};

const openAIRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [408, 429],
  retryableStatusRanges: [[500, 599]],
  retryableCodes: [...genericRetryableCodes, 'vector_store_timeout'],
  retryableMessagePatterns: [
    ...genericRetryableMessages,
    /rate limit reached/i,
    /slow down/i,
    /please try again later/i,
  ],
  nonRetryableCodes: ['insufficient_quota', 'billing_hard_limit_reached'],
  nonRetryableTypes: ['insufficient_quota'],
  nonRetryableMessagePatterns: [
    /exceeded your current quota/i,
    /maximum monthly spend/i,
    /\bplan and billing details\b/i,
    /\bbuy more credits\b/i,
  ],
};

const defaultRetryConfig: OpenAICompatibleRetryConfig = {
  retryableStatusCodes: [408, 429],
  retryableStatusRanges: [[500, 599]],
  retryableCodes: genericRetryableCodes,
  retryableMessagePatterns: genericRetryableMessages,
};

export function getDefaultOpenAICompatibleErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, defaultRetryConfig);
}

export function getCerebrasErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, cerebrasRetryConfig);
}

export function getDeepSeekErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, deepseekRetryConfig);
}

export function getKimiErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, kimiRetryConfig);
}

export function getOpenRouterErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, openRouterRetryConfig);
}

export function getZaiErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, zaiRetryConfig);
}

export function getOpenAIErrorDetails(error: unknown): AssistantError {
  return getOpenAICompatibleErrorDetails(error, openAIRetryConfig);
}

export function getChatFinishReasonErrorDetails(
  finishReason: string | null | undefined
): AssistantError | undefined {
  switch (finishReason) {
    case 'network_error':
      return {
        message: 'The provider reported a network error during streaming.',
        canRetry: true,
      };
    case 'content_filter':
      return {
        message: 'The request was rejected by the content filter during streaming.',
        canRetry: false,
      };
    case 'sensitive':
      return {
        message: 'The request was rejected due to sensitive content during streaming.',
        canRetry: false,
      };
    case 'error':
      return {
        message: 'The provider reported an error during streaming.',
        canRetry: false,
      };
    default:
      return undefined;
  }
}
