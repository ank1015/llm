import { Type, type Static } from '@sinclair/typebox';

import { NullableStringSchema } from './common.js';

export const DesktopEntryTypeSchema = Type.Union([Type.Literal('file'), Type.Literal('directory')]);
export type DesktopEntryTypeDto = Static<typeof DesktopEntryTypeSchema>;

export const DesktopListQuerySchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
    showHidden: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type DesktopListQuery = Static<typeof DesktopListQuerySchema>;

export const DesktopFileQuerySchema = Type.Object(
  {
    path: Type.Optional(Type.String()),
    maxBytes: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type DesktopFileQuery = Static<typeof DesktopFileQuerySchema>;

export const DesktopEntryDtoSchema = Type.Object(
  {
    name: Type.String(),
    path: Type.String(),
    type: DesktopEntryTypeSchema,
    size: Type.Union([Type.Number(), Type.Null()]),
    updatedAt: Type.String(),
    isHidden: Type.Boolean(),
    isSymlink: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type DesktopEntryDto = Static<typeof DesktopEntryDtoSchema>;

export const DesktopListResultSchema = Type.Object(
  {
    path: Type.String(),
    name: Type.String(),
    parent: NullableStringSchema,
    root: Type.String(),
    isRoot: Type.Boolean(),
    entries: Type.Array(DesktopEntryDtoSchema),
  },
  { additionalProperties: false }
);
export type DesktopListResult = Static<typeof DesktopListResultSchema>;

export const DesktopFileDtoSchema = Type.Object(
  {
    path: Type.String(),
    name: Type.String(),
    content: Type.String(),
    size: Type.Number(),
    updatedAt: Type.String(),
    isBinary: Type.Boolean(),
    truncated: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type DesktopFileDto = Static<typeof DesktopFileDtoSchema>;
