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
export const SESSION_COMPACTION_FILE_SUFFIX = '.compactions.jsonl';
export const SESSION_COMPACTION_NODE_TYPES = [
  'turn_compact',
  'ultra_compact',
  'ongoing_turn_compact',
] as const;

export type SessionCompactionNodeType = (typeof SESSION_COMPACTION_NODE_TYPES)[number];

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
  systemPrompt: string;
}

export interface SessionSummary {
  sessionId: string;
  sessionName: string;
  createdAt: string;
  updatedAt: string | null;
  nodeCount: number;
}

export interface SessionCompactionNodeBase {
  id: string;
  type: SessionCompactionNodeType;
  createdAt: string;
  /** Branch whose history this compaction record applies to */
  branchName: string;
  /** Earliest message node replaced by this compaction record */
  firstNodeId: string;
  /** Latest message node replaced by this compaction record */
  lastNodeId: string;
  compactionSummary: string;
}

export interface SessionTurnCompactionNode extends SessionCompactionNodeBase {
  type: 'turn_compact';
}

export interface SessionUltraCompactionNode extends SessionCompactionNodeBase {
  type: 'ultra_compact';
}

export interface SessionOngoingTurnCompactionNode extends SessionCompactionNodeBase {
  type: 'ongoing_turn_compact';
}

export type SessionCompactionNode =
  | SessionTurnCompactionNode
  | SessionUltraCompactionNode
  | SessionOngoingTurnCompactionNode;

export interface CreateSessionCompactionNodeInputBase {
  branchName: string;
  firstNodeId: string;
  lastNodeId: string;
  compactionSummary: string;
}

export interface CreateSessionTurnCompactionNodeInput extends CreateSessionCompactionNodeInputBase {
  type: 'turn_compact';
}

export interface CreateSessionUltraCompactionNodeInput extends CreateSessionCompactionNodeInputBase {
  type: 'ultra_compact';
}

export interface CreateSessionOngoingTurnCompactionNodeInput extends CreateSessionCompactionNodeInputBase {
  type: 'ongoing_turn_compact';
}

export type CreateSessionCompactionNodeInput =
  | CreateSessionTurnCompactionNodeInput
  | CreateSessionUltraCompactionNodeInput
  | CreateSessionOngoingTurnCompactionNodeInput;

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
