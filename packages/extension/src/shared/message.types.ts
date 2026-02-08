// ── Request Messages (Extension → Native Host) ─────────────────────

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

/** Messages sent from the Chrome extension to the native host */
export type ExtensionMessage = PingMessage | ExecuteMessage;

// ── Response Messages (Native Host → Extension) ────────────────────

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

/** Messages sent from the native host to the Chrome extension */
export type NativeResponse = PongResponse | SuccessResponse | ErrorResponse;
