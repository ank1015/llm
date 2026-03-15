import { Type, type Static } from '@sinclair/typebox';

import { NullableStringSchema } from './common.js';
import { SessionSummaryDtoSchema } from './sessions.js';

export const CreateProjectRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    projectImg: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type CreateProjectRequest = Static<typeof CreateProjectRequestSchema>;

export const RenameProjectRequestSchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type RenameProjectRequest = Static<typeof RenameProjectRequestSchema>;

export const UpdateProjectImageRequestSchema = Type.Object(
  {
    projectId: Type.Optional(Type.String()),
    projectName: Type.Optional(Type.String()),
    projectImg: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export interface UpdateProjectImageRequest {
  projectId?: string;
  projectName?: string;
  projectImg?: string;
}

export const ProjectDtoSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    description: NullableStringSchema,
    projectImg: NullableStringSchema,
    createdAt: Type.String(),
  },
  { additionalProperties: false }
);
export type ProjectDto = Static<typeof ProjectDtoSchema>;

export const ProjectDeleteResponseSchema = Type.Object(
  {
    deleted: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type ProjectDeleteResponse = Static<typeof ProjectDeleteResponseSchema>;

export const ProjectFileIndexQuerySchema = Type.Object(
  {
    query: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type ProjectFileIndexQuery = Static<typeof ProjectFileIndexQuerySchema>;

export const ProjectFileIndexEntrySchema = Type.Object(
  {
    artifactId: Type.String(),
    artifactName: Type.String(),
    path: Type.String(),
    type: Type.Union([Type.Literal('file'), Type.Literal('directory')]),
    artifactPath: Type.String(),
    size: Type.Number(),
    updatedAt: Type.String(),
  },
  { additionalProperties: false }
);
export type ProjectFileIndexEntry = Static<typeof ProjectFileIndexEntrySchema>;

export const ProjectFileIndexResultSchema = Type.Object(
  {
    projectId: Type.String(),
    query: Type.String(),
    files: Type.Array(ProjectFileIndexEntrySchema),
    truncated: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type ProjectFileIndexResult = Static<typeof ProjectFileIndexResultSchema>;

export const ArtifactDirOverviewDtoSchema = Type.Object(
  {
    id: Type.String(),
    name: Type.String(),
    description: NullableStringSchema,
    createdAt: Type.String(),
    sessions: Type.Array(SessionSummaryDtoSchema),
  },
  { additionalProperties: false }
);
export type ArtifactDirOverviewDto = Static<typeof ArtifactDirOverviewDtoSchema>;

export const ProjectOverviewDtoSchema = Type.Object(
  {
    project: ProjectDtoSchema,
    artifactDirs: Type.Array(ArtifactDirOverviewDtoSchema),
  },
  { additionalProperties: false }
);
export type ProjectOverviewDto = Static<typeof ProjectOverviewDtoSchema>;
