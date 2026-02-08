// ── Extension → Native Host ─────────────────────────────────────────

export interface PingMessage {
  type: 'ping';
  requestId: string;
}

export interface ExecuteMessage {
  type: 'execute';
  requestId: string;
  payload: {
    command: string;
    args?: Record<string, unknown>;
  };
}

/** Extension-initiated requests sent to the native host */
export type ExtensionMessage = PingMessage | ExecuteMessage;

// ── Native Host → Extension (responses) ────────────────────────────

export interface PongResponse {
  type: 'pong';
  requestId: string;
}

export interface SuccessResponse {
  type: 'success';
  requestId: string;
  data: unknown;
}

export interface ErrorResponse {
  type: 'error';
  requestId: string;
  error: string;
}

/** Responses the native host sends back to extension-initiated requests */
export type NativeResponse = PongResponse | SuccessResponse | ErrorResponse;

// ── Native Host → Extension (requests) ─────────────────────────────

export interface GetPageHtmlRequest {
  type: 'getPageHtml';
  requestId: string;
  tabId: number;
}

/** Requests the native host initiates towards the extension */
export type NativeRequest = GetPageHtmlRequest;

// ── Extension → Native Host (responses to native-initiated requests)

export interface PageHtmlResponse {
  type: 'pageHtml';
  requestId: string;
  html: string;
}

export interface PageHtmlErrorResponse {
  type: 'pageHtmlError';
  requestId: string;
  error: string;
}

/** Responses the extension sends back to native-initiated requests */
export type ExtensionResponse = PageHtmlResponse | PageHtmlErrorResponse;

// ── Aggregate types (for reading/writing on each side) ─────────────

/** Everything the native host can read from stdin */
export type NativeInbound = ExtensionMessage | ExtensionResponse;

/** Everything the native host can write to stdout */
export type NativeOutbound = NativeResponse | NativeRequest;
