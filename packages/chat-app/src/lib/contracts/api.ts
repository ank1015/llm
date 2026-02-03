import type {
  AgentEvent,
  Api,
  Attachment,
  Message,
  MessageNode,
  Model,
  SessionHeader,
  SessionSummary,
} from '@ank1015/llm-sdk';

export type ApiErrorBody = {
  code: string;
  message: string;
};

export type ApiErrorResponse = {
  ok: false;
  error: ApiErrorBody;
};

export type SessionScope = {
  projectName?: string;
  path?: string;
};

export type SessionRef = SessionScope & {
  sessionId: string;
};

export type SessionsListRequest = SessionScope & {
  query?: string;
  limit?: number;
  offset?: number;
};

export type SessionsListResponse = {
  ok: true;
  projectName: string;
  path: string;
  query: string | null;
  total: number;
  count: number;
  sessions: SessionSummary[];
};

export type CreateSessionRequest = SessionScope & {
  sessionName?: string;
};

export type CreateSessionResponse = {
  ok: true;
  projectName: string;
  path: string;
  sessionId: string;
  header: SessionHeader;
};

export type RenameSessionRequest = SessionRef & {
  sessionName: string;
};

export type RenameSessionResponse = {
  ok: true;
  sessionId: string;
  header: SessionHeader;
};

export type DeleteSessionRequest = SessionRef;

export type DeleteSessionResponse = {
  ok: true;
  sessionId: string;
  deleted: boolean;
};

export type SessionMessagesRequest = SessionRef & {
  branch?: string;
  limit?: number;
  offset?: number;
};

export type SessionMessagesResponse = {
  ok: true;
  branch: string | null;
  total: number;
  count: number;
  messages: MessageNode[];
};

export type ConversationTurnRequest = SessionRef & {
  prompt: string;
  api: Api;
  modelId: string;
  branch?: string;
  parentId?: string;
  providerOptions?: Record<string, unknown>;
  systemPrompt?: string;
  attachments?: Attachment[];
};

export type ConversationTurnResponse = {
  ok: true;
  sessionId: string;
  branch: string;
  messageCount: number;
  messages: Message[];
  nodes: MessageNode[];
};

export type StreamReadyEventData = {
  ok: true;
  sessionId: string;
  branch: string;
};

export type StreamDoneEventData = {
  ok: true;
  sessionId: string;
  branch: string;
  messageCount: number;
  nodeCount: number;
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

export type ModelInput = 'text' | 'image' | 'file';

export type ProviderInfo = {
  api: Api;
  hasKey: boolean;
  modelCount: number;
  available: boolean;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportedInputs: ModelInput[];
};

export type ProvidersResponse = {
  ok: true;
  providers: ProviderInfo[];
};

export type ModelsQuery = {
  api?: Api;
  provider?: Api;
  reasoning?: boolean;
  input?: ModelInput;
  tool?: string;
};

export type ModelsResponse = {
  ok: true;
  filters: {
    api: Api | null;
    reasoning: boolean | null;
    input: ModelInput | null;
    tool: string | null;
  };
  count: number;
  models: Model<Api>[];
};
