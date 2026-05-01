import { BedrockRuntimeServiceException } from '@aws-sdk/client-bedrock-runtime';

import type { AssistantError } from '../../types/index.js';

const RETRYABLE_ERROR_NAMES = new Set([
  'InternalServerException',
  'ModelStreamErrorException',
  'ModelTimeoutException',
  'ServiceUnavailableException',
  'ThrottlingException',
]);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function canRetryAwsBedrockError(error: unknown): boolean {
  if (error instanceof BedrockRuntimeServiceException) {
    if (RETRYABLE_ERROR_NAMES.has(error.name)) {
      return true;
    }

    return (
      error.$metadata.httpStatusCode === 408 ||
      error.$metadata.httpStatusCode === 429 ||
      (typeof error.$metadata.httpStatusCode === 'number' && error.$metadata.httpStatusCode >= 500)
    );
  }

  if (error instanceof Error && RETRYABLE_ERROR_NAMES.has(error.name)) {
    return true;
  }

  return false;
}

export function getAwsBedrockErrorDetails(error: unknown): AssistantError {
  return {
    message: getErrorMessage(error),
    canRetry: canRetryAwsBedrockError(error),
  };
}
