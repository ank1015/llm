import type { AgentEvent, Api, MessageNode } from '@ank1015/llm-sdk';

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

export type ModelSelection = {
  api: Api;
  modelId: string;
};

export type ReasoningLevel = 'low' | 'medium' | 'high' | 'xhigh';

export type TurnSettings = ModelSelection & {
  reasoningLevel: ReasoningLevel;
};

export type VisibleLeafSelection = {
  leafNodeId?: string;
};

/** Metadata returned by the server when creating a session */
export type SessionMetadata = {
  id: string;
  name: string;
  api: string;
  modelId: string;
  createdAt: string;
  activeBranch: string;
};

export type LiveRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type LiveRunSummary = {
  runId: string;
  mode: 'prompt' | 'retry' | 'edit';
  status: LiveRunStatus;
  startedAt: string;
  finishedAt?: string;
};

export type SessionTreeResponse = {
  nodes: MessageNode[];
  persistedLeafNodeId: string | null;
  activeBranch: string;
  liveRun?: LiveRunSummary;
};

export type StreamReadyEventData = {
  ok: true;
  sessionId: string;
  runId: string;
  status: LiveRunStatus;
};

export type StreamAgentEventData = {
  seq: number;
  event: AgentEvent;
};

export type StreamNodePersistedEventData = {
  seq: number;
  node: MessageNode;
};

export type StreamDoneEventData = {
  ok: true;
  sessionId: string;
  runId: string;
  status: 'completed' | 'cancelled';
  messageCount: number;
};

export type StreamErrorEventData = {
  ok: false;
  sessionId: string;
  runId: string;
  seq: number;
  code: string;
  message: string;
};

export type StreamEventMap = {
  ready: StreamReadyEventData;
  agent_event: StreamAgentEventData;
  node_persisted: StreamNodePersistedEventData;
  done: StreamDoneEventData;
  error: StreamErrorEventData;
};

export type StreamEventName = keyof StreamEventMap;
