export const browserToolErrorCodes = [
  'INVALID_INPUT',
  'TAB_ID_MISSING',
  'TAB_NOT_FOUND',
  'TAB_SCOPE_VIOLATION',
  'TARGET_NOT_FOUND',
  'TARGET_NOT_INTERACTABLE',
  'NO_OBSERVABLE_EFFECT',
  'ACTION_TIMEOUT',
  'NAVIGATION_TIMEOUT',
  'PAYLOAD_INVALID',
  'UNSUPPORTED_ACTION',
  'INTERNAL',
] as const;

export type BrowserToolErrorCode = (typeof browserToolErrorCodes)[number];

export interface BrowserToolErrorOptions {
  cause?: unknown;
  retryable?: boolean;
}

export class BrowserToolError extends Error {
  readonly code: BrowserToolErrorCode;
  readonly retryable: boolean;

  constructor(code: BrowserToolErrorCode, message: string, options?: BrowserToolErrorOptions) {
    super(
      formatBrowserToolErrorMessage(code, message),
      options?.cause ? { cause: options.cause } : undefined
    );
    this.name = `BrowserToolError:${code}`;
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

export function formatBrowserToolErrorMessage(code: BrowserToolErrorCode, message: string): string {
  const normalized = (message || 'Unexpected browser tool failure').trim();
  if (normalized.startsWith(`[${code}]`)) {
    return normalized;
  }
  return `[${code}] ${normalized}`;
}

export function browserToolError(
  code: BrowserToolErrorCode,
  message: string,
  options?: BrowserToolErrorOptions
): BrowserToolError {
  return new BrowserToolError(code, message, options);
}

export function toBrowserToolError(
  error: unknown,
  fallbackCode: BrowserToolErrorCode,
  fallbackMessage: string
): BrowserToolError {
  if (error instanceof BrowserToolError) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return browserToolError(fallbackCode, error.message, { cause: error });
  }

  return browserToolError(fallbackCode, fallbackMessage, { cause: error });
}
