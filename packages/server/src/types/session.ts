import type { Attachment } from '@ank1015/llm-core';
import type { CuratedModelId, ReasoningEffort } from '@ank1015/llm-sdk';
import type {
  SessionHeaderNode,
  SessionMessageNode as SdkSessionMessageNode,
  SessionNode as SdkSessionNode,
} from '@ank1015/llm-sdk/session';

export const DEFAULT_SESSION_NAME = 'Untitled Session';
export const DEFAULT_ACTIVE_BRANCH = 'main';
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
export const SESSION_FILE_EXTENSION = '.jsonl';

export interface SessionHeaderMetadata {
  modelId: CuratedModelId;
  activeBranch?: string;
}

export interface SessionMessageMetadata {
  modelId: CuratedModelId;
}

export type SessionMessageNode = Omit<SdkSessionMessageNode, 'metadata'> & {
  metadata?: SessionMessageMetadata & Record<string, unknown>;
};

export type SessionNode = SessionHeaderNode | SessionMessageNode | SdkSessionNode;

export interface SessionMetadata {
  id: string;
  name: string;
  modelId: CuratedModelId;
  createdAt: string;
  activeBranch: string;
}

export interface SessionSummary {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  updatedAt: string | null;
  nodeCount: number;
}

export interface CreateSessionOptions {
  name?: string;
  modelId: CuratedModelId;
}

export interface PromptInput {
  message: string;
  attachments?: Attachment[];
  leafNodeId?: string;
  modelId?: CuratedModelId;
  reasoningEffort?: ReasoningEffort;
}

export interface TurnSettingsInput {
  leafNodeId?: string;
  modelId?: CuratedModelId;
  reasoningEffort?: ReasoningEffort;
}
