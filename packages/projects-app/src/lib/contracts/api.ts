import type { AgentEvent } from '@ank1015/llm-sdk';

export type ApiErrorBody = {
  code: string;
  message: string;
};

export type ApiErrorResponse = {
  ok: false;
  error: ApiErrorBody;
};

export type SessionRef = {
  sessionId: string;
};

/** Metadata returned by the server when creating a session */
export type SessionMetadata = {
  id: string;
  name: string;
  api: string;
  modelId: string;
  createdAt: string;
};

export type StreamReadyEventData = {
  ok: true;
  sessionId: string;
};

export type StreamDoneEventData = {
  ok: true;
  sessionId: string;
  messageCount: number;
};

export type StreamErrorEventData = {
  ok: false;
  code: string;
  message: string;
};

export type StreamEventMap = {
  ready: StreamReadyEventData;
  agent_event: AgentEvent;
  done: StreamDoneEventData;
  error: StreamErrorEventData;
};

export type StreamEventName = keyof StreamEventMap;
