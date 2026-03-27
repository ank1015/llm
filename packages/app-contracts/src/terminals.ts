import { Type, type Static, type TSchema } from '@sinclair/typebox';

import { NullableStringSchema } from './common.js';

export const TERMINAL_STATUSES = ['running', 'exited'] as const;

const terminalStatusLiterals = TERMINAL_STATUSES.map((status) => Type.Literal(status));

export const TerminalStatusSchema = Type.Union(
  terminalStatusLiterals as unknown as [TSchema, TSchema]
);
export type TerminalStatus = Static<typeof TerminalStatusSchema>;

export const CreateTerminalRequestSchema = Type.Object(
  {
    cols: Type.Optional(Type.Integer({ minimum: 1 })),
    rows: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false }
);
export type CreateTerminalRequest = Static<typeof CreateTerminalRequestSchema>;

export const TerminalSummaryDtoSchema = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    status: TerminalStatusSchema,
    projectId: Type.String(),
    artifactId: Type.String(),
    cols: Type.Integer(),
    rows: Type.Integer(),
    createdAt: Type.String(),
    lastActiveAt: Type.String(),
    exitCode: Type.Union([Type.Integer(), Type.Null()]),
    signal: NullableStringSchema,
    exitedAt: NullableStringSchema,
  },
  { additionalProperties: false }
);
export type TerminalSummaryDto = Static<typeof TerminalSummaryDtoSchema>;

export const TerminalMetadataDtoSchema = Type.Object(
  {
    ...TerminalSummaryDtoSchema.properties,
    cwdAtLaunch: Type.String(),
    shell: Type.String(),
  },
  { additionalProperties: false }
);
export type TerminalMetadataDto = Static<typeof TerminalMetadataDtoSchema>;

export const DeleteTerminalResponseSchema = Type.Object(
  {
    deleted: Type.Literal(true),
    terminalId: Type.String(),
  },
  { additionalProperties: false }
);
export type DeleteTerminalResponse = Static<typeof DeleteTerminalResponseSchema>;

export const AttachTerminalQuerySchema = Type.Object(
  {
    afterSeq: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type AttachTerminalQuery = Static<typeof AttachTerminalQuerySchema>;

export const TerminalConflictResponseSchema = Type.Object(
  {
    error: Type.String(),
    terminal: TerminalSummaryDtoSchema,
  },
  { additionalProperties: false }
);
export type TerminalConflictResponse = Static<typeof TerminalConflictResponseSchema>;

export const TerminalReadyMessageSchema = Type.Object(
  {
    type: Type.Literal('ready'),
    terminal: TerminalMetadataDtoSchema,
  },
  { additionalProperties: false }
);
export type TerminalReadyMessage = Static<typeof TerminalReadyMessageSchema>;

export const TerminalOutputMessageSchema = Type.Object(
  {
    type: Type.Literal('output'),
    seq: Type.Integer(),
    data: Type.String(),
  },
  { additionalProperties: false }
);
export type TerminalOutputMessage = Static<typeof TerminalOutputMessageSchema>;

export const TerminalExitMessageSchema = Type.Object(
  {
    type: Type.Literal('exit'),
    seq: Type.Integer(),
    exitCode: Type.Union([Type.Integer(), Type.Null()]),
    signal: NullableStringSchema,
    exitedAt: Type.String(),
  },
  { additionalProperties: false }
);
export type TerminalExitMessage = Static<typeof TerminalExitMessageSchema>;

export const TerminalErrorMessageSchema = Type.Object(
  {
    type: Type.Literal('error'),
    seq: Type.Integer(),
    code: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false }
);
export type TerminalErrorMessage = Static<typeof TerminalErrorMessageSchema>;

export const TerminalServerMessageSchema = Type.Union([
  TerminalReadyMessageSchema,
  TerminalOutputMessageSchema,
  TerminalExitMessageSchema,
  TerminalErrorMessageSchema,
]);
export type TerminalServerMessage = Static<typeof TerminalServerMessageSchema>;

export const TerminalInputMessageSchema = Type.Object(
  {
    type: Type.Literal('input'),
    data: Type.String(),
  },
  { additionalProperties: false }
);
export type TerminalInputMessage = Static<typeof TerminalInputMessageSchema>;

export const TerminalResizeMessageSchema = Type.Object(
  {
    type: Type.Literal('resize'),
    cols: Type.Integer({ minimum: 1 }),
    rows: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false }
);
export type TerminalResizeMessage = Static<typeof TerminalResizeMessageSchema>;

export const TerminalClientMessageSchema = Type.Union([
  TerminalInputMessageSchema,
  TerminalResizeMessageSchema,
]);
export type TerminalClientMessage = Static<typeof TerminalClientMessageSchema>;
