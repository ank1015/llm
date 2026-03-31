import { Type, type Static } from '@sinclair/typebox';

import { NullableStringSchema } from './common.js';

export const ArtifactEntryTypeSchema = Type.Union([
  Type.Literal('file'),
  Type.Literal('directory'),
]);
export type ArtifactEntryType = Static<typeof ArtifactEntryTypeSchema>;

export const CheckpointSummaryStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('ready'),
  Type.Literal('failed'),
  Type.Literal('unavailable'),
]);
export type CheckpointSummaryStatusDto = Static<typeof CheckpointSummaryStatusSchema>;

export const CreateArtifactDirRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type CreateArtifactDirRequest = Static<typeof CreateArtifactDirRequestSchema>;

export const RenameArtifactDirRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type RenameArtifactDirRequest = Static<typeof RenameArtifactDirRequestSchema>;

export const ArtifactDirDtoSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    description: NullableStringSchema,
    createdAt: Type.String(),
  },
  { additionalProperties: false }
);
export type ArtifactDirDto = Static<typeof ArtifactDirDtoSchema>;

export const ArtifactDirDeleteResponseSchema = Type.Object(
  {
    deleted: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type ArtifactDirDeleteResponse = Static<typeof ArtifactDirDeleteResponseSchema>;

export const ArtifactFilesListResponseSchema = Type.Array(Type.String());
export type ArtifactFilesListResponse = Static<typeof ArtifactFilesListResponseSchema>;

export const ArtifactExplorerQuerySchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type ArtifactExplorerQuery = Static<typeof ArtifactExplorerQuerySchema>;

export const ArtifactExplorerEntrySchema = Type.Object(
  {
    name: Type.String(),
    path: Type.String(),
    type: ArtifactEntryTypeSchema,
    size: Type.Union([Type.Number(), Type.Null()]),
    updatedAt: Type.String(),
  },
  { additionalProperties: false }
);
export type ArtifactExplorerEntry = Static<typeof ArtifactExplorerEntrySchema>;

export const ArtifactExplorerResultSchema = Type.Object(
  {
    path: Type.String(),
    entries: Type.Array(ArtifactExplorerEntrySchema),
  },
  { additionalProperties: false }
);
export type ArtifactExplorerResult = Static<typeof ArtifactExplorerResultSchema>;

export const ArtifactFileQuerySchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
    maxBytes: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type ArtifactFileQuery = Static<typeof ArtifactFileQuerySchema>;

export const ArtifactRawFileQuerySchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type ArtifactRawFileQuery = Static<typeof ArtifactRawFileQuerySchema>;

export const ArtifactFileDtoSchema = Type.Object(
  {
    path: Type.String(),
    content: Type.String(),
    size: Type.Number(),
    updatedAt: Type.String(),
    isBinary: Type.Boolean(),
    truncated: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type ArtifactFileDto = Static<typeof ArtifactFileDtoSchema>;

export const UpdateArtifactFileRequestSchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
    content: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type UpdateArtifactFileRequest = Static<typeof UpdateArtifactFileRequestSchema>;

export const RenameArtifactPathRequestSchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
    newName: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type RenameArtifactPathRequest = Static<typeof RenameArtifactPathRequestSchema>;

export const RenameArtifactPathResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    oldPath: Type.String(),
    newPath: Type.String(),
    type: ArtifactEntryTypeSchema,
  },
  { additionalProperties: false }
);
export type RenameArtifactPathResponse = Static<typeof RenameArtifactPathResponseSchema>;

export const DeleteArtifactPathQuerySchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type DeleteArtifactPathQuery = Static<typeof DeleteArtifactPathQuerySchema>;

export const DeleteArtifactPathResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    deleted: Type.Literal(true),
    path: Type.String(),
    type: ArtifactEntryTypeSchema,
  },
  { additionalProperties: false }
);
export type DeleteArtifactPathResponse = Static<typeof DeleteArtifactPathResponseSchema>;

export const ArtifactCheckpointDtoSchema = Type.Object(
  {
    commitHash: Type.String(),
    shortHash: Type.String(),
    createdAt: Type.String(),
    summaryStatus: CheckpointSummaryStatusSchema,
    title: NullableStringSchema,
    description: NullableStringSchema,
    isHead: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type ArtifactCheckpointDto = Static<typeof ArtifactCheckpointDtoSchema>;

export const ArtifactCheckpointListResponseSchema = Type.Object(
  {
    hasRepository: Type.Boolean(),
    dirty: Type.Boolean(),
    headCommitHash: NullableStringSchema,
    checkpoints: Type.Array(ArtifactCheckpointDtoSchema),
  },
  { additionalProperties: false }
);
export type ArtifactCheckpointListResponse = Static<typeof ArtifactCheckpointListResponseSchema>;

export const ArtifactCheckpointRollbackResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
    reverted: Type.Boolean(),
    headCommitHash: Type.String(),
  },
  { additionalProperties: false }
);
export type ArtifactCheckpointRollbackResponse = Static<
  typeof ArtifactCheckpointRollbackResponseSchema
>;

export const ArtifactCheckpointDiffChangeTypeSchema = Type.Union([
  Type.Literal('added'),
  Type.Literal('modified'),
  Type.Literal('deleted'),
  Type.Literal('renamed'),
]);
export type ArtifactCheckpointDiffChangeTypeDto = Static<
  typeof ArtifactCheckpointDiffChangeTypeSchema
>;

export const ArtifactCheckpointDiffFileSchema = Type.Object(
  {
    path: Type.String(),
    previousPath: NullableStringSchema,
    changeType: ArtifactCheckpointDiffChangeTypeSchema,
    isBinary: Type.Boolean(),
    beforeText: NullableStringSchema,
    afterText: NullableStringSchema,
    textTruncated: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type ArtifactCheckpointDiffFileDto = Static<typeof ArtifactCheckpointDiffFileSchema>;

export const ArtifactCheckpointDiffResponseSchema = Type.Object(
  {
    hasRepository: Type.Boolean(),
    headCommitHash: NullableStringSchema,
    dirty: Type.Boolean(),
    files: Type.Array(ArtifactCheckpointDiffFileSchema),
  },
  { additionalProperties: false }
);
export type ArtifactCheckpointDiffResponse = Static<typeof ArtifactCheckpointDiffResponseSchema>;
