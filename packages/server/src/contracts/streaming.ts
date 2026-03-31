import { Type, type Static, type TSchema } from '@sinclair/typebox';

import { AgentEventSchema, SessionMessageNodeSchema } from './common.js';

export const LIVE_RUN_MODES = ['prompt', 'retry', 'edit'] as const;
export const LIVE_RUN_STATUSES = ['running', 'completed', 'failed', 'cancelled'] as const;

const liveRunModeLiterals = LIVE_RUN_MODES.map((mode) => Type.Literal(mode));
const liveRunStatusLiterals = LIVE_RUN_STATUSES.map((status) => Type.Literal(status));

export const LiveRunModeSchema = Type.Union(
  liveRunModeLiterals as unknown as [TSchema, TSchema, TSchema]
);
export type LiveRunMode = Static<typeof LiveRunModeSchema>;

export const LiveRunStatusSchema = Type.Union(
  liveRunStatusLiterals as unknown as [TSchema, TSchema, TSchema, TSchema]
);
export type LiveRunStatus = Static<typeof LiveRunStatusSchema>;

export const LiveRunSummaryDtoSchema = Type.Object(
  {
    runId: Type.String(),
    mode: LiveRunModeSchema,
    status: LiveRunStatusSchema,
    startedAt: Type.String(),
    finishedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type LiveRunSummaryDto = Static<typeof LiveRunSummaryDtoSchema>;

export const StreamReadyEventDataSchema = Type.Object(
  {
    ok: Type.Literal(true),
    sessionId: Type.String(),
    runId: Type.String(),
    status: LiveRunStatusSchema,
  },
  { additionalProperties: false }
);
export type StreamReadyEventData = Static<typeof StreamReadyEventDataSchema>;

export const StreamAgentEventDataSchema = Type.Object(
  {
    seq: Type.Number(),
    event: AgentEventSchema,
  },
  { additionalProperties: false }
);
export type StreamAgentEventData = Static<typeof StreamAgentEventDataSchema>;

export const StreamNodePersistedEventDataSchema = Type.Object(
  {
    seq: Type.Number(),
    node: SessionMessageNodeSchema,
  },
  { additionalProperties: false }
);
export type StreamNodePersistedEventData = Static<typeof StreamNodePersistedEventDataSchema>;

export const StreamDoneEventDataSchema = Type.Object(
  {
    ok: Type.Literal(true),
    sessionId: Type.String(),
    runId: Type.String(),
    status: Type.Union([Type.Literal('completed'), Type.Literal('cancelled')]),
    messageCount: Type.Number(),
  },
  { additionalProperties: false }
);
export type StreamDoneEventData = Static<typeof StreamDoneEventDataSchema>;

export const StreamErrorEventDataSchema = Type.Object(
  {
    ok: Type.Literal(false),
    sessionId: Type.String(),
    runId: Type.String(),
    seq: Type.Number(),
    code: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false }
);
export type StreamErrorEventData = Static<typeof StreamErrorEventDataSchema>;

export const StreamConflictResponseSchema = Type.Object(
  {
    error: Type.String(),
    liveRun: LiveRunSummaryDtoSchema,
  },
  { additionalProperties: false }
);
export type StreamConflictResponse = Static<typeof StreamConflictResponseSchema>;

export const CancelSessionRunResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    sessionId: Type.String(),
    runId: Type.String(),
    cancelled: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type CancelSessionRunResponse = Static<typeof CancelSessionRunResponseSchema>;

export const AttachSessionRunQuerySchema = Type.Object(
  {
    afterSeq: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type AttachSessionRunQuery = Static<typeof AttachSessionRunQuerySchema>;
