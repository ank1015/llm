import { Type, type Static } from '@sinclair/typebox';

import {
  ApiSchema,
  MessageNodeSchema,
  MessageSchema,
  NullableStringSchema,
  ReasoningLevelSchema,
  type ReasoningLevelContract,
} from './common.js';
import { LiveRunSummaryDtoSchema } from './streaming.js';

import type { Api } from '@ank1015/llm-types';

export const CreateSessionRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    api: Type.Optional(ApiSchema),
    modelId: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export interface CreateSessionRequest {
  name?: string;
  api?: Api;
  modelId?: string;
}

export const SessionMetadataDtoSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    api: Type.String(),
    modelId: Type.String(),
    createdAt: Type.String(),
    activeBranch: Type.String(),
  },
  { additionalProperties: false }
);
export type SessionMetadataDto = Static<typeof SessionMetadataDtoSchema>;

export const SessionSummaryDtoSchema = Type.Object(
  {
    sessionId: Type.String(),
    sessionName: Type.String(),
    createdAt: Type.String(),
    updatedAt: NullableStringSchema,
    nodeCount: Type.Number(),
  },
  { additionalProperties: false }
);
export type SessionSummaryDto = Static<typeof SessionSummaryDtoSchema>;

export const SessionMessagesResponseSchema = Type.Array(MessageNodeSchema);
export type SessionMessagesResponse = Static<typeof SessionMessagesResponseSchema>;

export const SessionTreeResponseSchema = Type.Object(
  {
    nodes: Type.Array(MessageNodeSchema),
    persistedLeafNodeId: Type.Union([Type.String(), Type.Null()]),
    activeBranch: Type.String(),
    liveRun: Type.Optional(LiveRunSummaryDtoSchema),
  },
  { additionalProperties: false }
);
export type SessionTreeResponse = Static<typeof SessionTreeResponseSchema>;

export const SessionAttachmentInputSchema = Type.Object(
  {
    id: Type.String(),
    type: Type.Union([Type.Literal('image'), Type.Literal('file')]),
    fileName: Type.String(),
    mimeType: Type.String(),
    size: Type.Optional(Type.Number()),
    content: Type.String(),
  },
  { additionalProperties: false }
);
export type SessionAttachmentInput = Static<typeof SessionAttachmentInputSchema>;

export const SessionPromptRequestSchema = Type.Object(
  {
    message: Type.Optional(Type.String()),
    attachments: Type.Optional(Type.Array(SessionAttachmentInputSchema)),
    leafNodeId: Type.Optional(Type.String()),
    api: Type.Optional(ApiSchema),
    modelId: Type.Optional(Type.String()),
    reasoningLevel: Type.Optional(ReasoningLevelSchema),
    reasoning: Type.Optional(ReasoningLevelSchema),
  },
  { additionalProperties: false }
);
export interface SessionPromptRequest {
  message?: string;
  attachments?: SessionAttachmentInput[];
  leafNodeId?: string;
  api?: Api;
  modelId?: string;
  reasoningLevel?: ReasoningLevelContract;
  reasoning?: ReasoningLevelContract;
}

export const SessionTurnSettingsRequestSchema = Type.Object(
  {
    leafNodeId: Type.Optional(Type.String()),
    api: Type.Optional(ApiSchema),
    modelId: Type.Optional(Type.String()),
    reasoningLevel: Type.Optional(ReasoningLevelSchema),
    reasoning: Type.Optional(ReasoningLevelSchema),
  },
  { additionalProperties: false }
);
export interface SessionTurnSettingsRequest {
  leafNodeId?: string;
  api?: Api;
  modelId?: string;
  reasoningLevel?: ReasoningLevelContract;
  reasoning?: ReasoningLevelContract;
}

export const SessionPromptResponseSchema = Type.Array(MessageSchema);
export type SessionPromptResponse = Static<typeof SessionPromptResponseSchema>;

export const GenerateSessionNameRequestSchema = Type.Object(
  {
    query: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type GenerateSessionNameRequest = Static<typeof GenerateSessionNameRequestSchema>;

export const RenameSessionRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type RenameSessionRequest = Static<typeof RenameSessionRequestSchema>;

export const SessionNameResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    sessionId: Type.String(),
    sessionName: Type.String(),
  },
  { additionalProperties: false }
);
export type SessionNameResponse = Static<typeof SessionNameResponseSchema>;

export const DeleteSessionResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    sessionId: Type.String(),
    deleted: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type DeleteSessionResponse = Static<typeof DeleteSessionResponseSchema>;
