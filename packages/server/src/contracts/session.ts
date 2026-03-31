import { CuratedModelIds, ReasoningEfforts } from '@ank1015/llm-sdk';
import { Type, type Static, type TSchema } from '@sinclair/typebox';

import { MessageSchema, SessionMessageNodeSchema } from './common.js';
import { LiveRunSummaryDtoSchema } from './streaming.js';

const modelIdLiterals = CuratedModelIds.map((modelId) => Type.Literal(modelId));
const reasoningEffortLiterals = ReasoningEfforts.map((effort) => Type.Literal(effort));

export const CuratedModelIdSchema = Type.Union(
  modelIdLiterals as unknown as [TSchema, TSchema, ...TSchema[]]
);
export type CuratedModelIdContract = Static<typeof CuratedModelIdSchema>;

export const ReasoningEffortSchema = Type.Union(
  reasoningEffortLiterals as unknown as [TSchema, TSchema, TSchema, TSchema]
);
export type ReasoningEffortContract = Static<typeof ReasoningEffortSchema>;

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

export const CreateSessionRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    modelId: CuratedModelIdSchema,
  },
  { additionalProperties: false }
);
export type CreateSessionRequest = Static<typeof CreateSessionRequestSchema>;

export const SessionMetadataDtoSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
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
    updatedAt: Type.Union([Type.String(), Type.Null()]),
    nodeCount: Type.Number(),
  },
  { additionalProperties: false }
);
export type SessionSummaryDto = Static<typeof SessionSummaryDtoSchema>;

export const SessionMessagesResponseSchema = Type.Array(SessionMessageNodeSchema);
export type SessionMessagesResponse = Static<typeof SessionMessagesResponseSchema>;

export const SessionTreeResponseSchema = Type.Object(
  {
    nodes: Type.Array(SessionMessageNodeSchema),
    persistedLeafNodeId: Type.Union([Type.String(), Type.Null()]),
    activeBranch: Type.String(),
    liveRun: Type.Optional(LiveRunSummaryDtoSchema),
  },
  { additionalProperties: false }
);
export type SessionTreeResponse = Static<typeof SessionTreeResponseSchema>;

export const SessionPromptRequestSchema = Type.Object(
  {
    message: Type.Optional(Type.String()),
    attachments: Type.Optional(Type.Array(SessionAttachmentInputSchema)),
    leafNodeId: Type.Optional(Type.String()),
    modelId: Type.Optional(CuratedModelIdSchema),
    reasoningEffort: Type.Optional(ReasoningEffortSchema),
  },
  { additionalProperties: false }
);
export type SessionPromptRequest = Static<typeof SessionPromptRequestSchema>;

export const SessionTurnSettingsRequestSchema = Type.Object(
  {
    leafNodeId: Type.Optional(Type.String()),
    modelId: Type.Optional(CuratedModelIdSchema),
    reasoningEffort: Type.Optional(ReasoningEffortSchema),
  },
  { additionalProperties: false }
);
export type SessionTurnSettingsRequest = Static<typeof SessionTurnSettingsRequestSchema>;

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
