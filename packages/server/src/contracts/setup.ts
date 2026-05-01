import { Type } from '@sinclair/typebox';

import { AgentEventSchema } from './common.js';

import type { Static } from '@sinclair/typebox';

export const SetupCheckNameSchema = Type.Union([
  Type.Literal('node'),
  Type.Literal('npx'),
  Type.Literal('python'),
  Type.Literal('git'),
  Type.Literal('chrome-controller'),
]);
export type SetupCheckName = Static<typeof SetupCheckNameSchema>;

export const SetupCheckSchema = Type.Object(
  {
    name: SetupCheckNameSchema,
    label: Type.String(),
    command: Type.String(),
    installed: Type.Boolean(),
    version: Type.Optional(Type.String()),
    executablePath: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type SetupCheck = Static<typeof SetupCheckSchema>;

export const SetupStatusSchema = Type.Object(
  {
    setupComplete: Type.Boolean(),
    setupCompletedAt: Type.Optional(Type.String()),
    statePath: Type.String(),
    projectsRoot: Type.String(),
    checks: Type.Array(SetupCheckSchema),
    ready: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type SetupStatus = Static<typeof SetupStatusSchema>;

export const SetupCompleteResultSchema = Type.Union([
  Type.Object(
    {
      ok: Type.Literal(true),
      status: SetupStatusSchema,
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      ok: Type.Literal(false),
      message: Type.String(),
      status: SetupStatusSchema,
    },
    { additionalProperties: false }
  ),
]);
export type SetupCompleteResult = Static<typeof SetupCompleteResultSchema>;

export const SetupRuntimeContextSchema = Type.Object(
  {
    platform: Type.String(),
    arch: Type.String(),
    release: Type.String(),
    shell: Type.Optional(Type.String()),
    path: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type SetupRuntimeContext = Static<typeof SetupRuntimeContextSchema>;

export const SetupRequirementsContextSchema = Type.Object(
  {
    status: SetupStatusSchema,
    missing: Type.Array(SetupCheckSchema),
    runtime: SetupRuntimeContextSchema,
  },
  { additionalProperties: false }
);
export type SetupRequirementsContext = Static<typeof SetupRequirementsContextSchema>;

export const SetupAgentRunSummarySchema = Type.Object(
  {
    runId: Type.String(),
    status: Type.Union([
      Type.Literal('running'),
      Type.Literal('completed'),
      Type.Literal('failed'),
      Type.Literal('cancelled'),
    ]),
    startedAt: Type.String(),
    finishedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type SetupAgentRunSummary = Static<typeof SetupAgentRunSummarySchema>;

export const SetupAgentStartResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    run: SetupAgentRunSummarySchema,
  },
  { additionalProperties: false }
);
export type SetupAgentStartResponse = Static<typeof SetupAgentStartResponseSchema>;

export const SetupAgentReadyEventDataSchema = Type.Object(
  {
    ok: Type.Literal(true),
    runId: Type.String(),
    status: SetupAgentRunSummarySchema.properties.status,
  },
  { additionalProperties: false }
);
export type SetupAgentReadyEventData = Static<typeof SetupAgentReadyEventDataSchema>;

export const SetupAgentEventDataSchema = Type.Object(
  {
    seq: Type.Number(),
    event: AgentEventSchema,
  },
  { additionalProperties: false }
);
export type SetupAgentEventData = Static<typeof SetupAgentEventDataSchema>;

export const SetupAgentDoneEventDataSchema = Type.Object(
  {
    ok: Type.Literal(true),
    runId: Type.String(),
    status: Type.Union([Type.Literal('completed'), Type.Literal('cancelled')]),
    ready: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type SetupAgentDoneEventData = Static<typeof SetupAgentDoneEventDataSchema>;

export const SetupAgentErrorEventDataSchema = Type.Object(
  {
    ok: Type.Literal(false),
    runId: Type.String(),
    seq: Type.Number(),
    code: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false }
);
export type SetupAgentErrorEventData = Static<typeof SetupAgentErrorEventDataSchema>;

export const SetupAgentCancelResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    runId: Type.String(),
    cancelled: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type SetupAgentCancelResponse = Static<typeof SetupAgentCancelResponseSchema>;
