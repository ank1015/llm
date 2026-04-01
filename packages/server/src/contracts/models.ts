import { Static, Type } from '@sinclair/typebox';

import { CuratedModelIdSchema } from './session.js';

export const ModelApiSchema = Type.Union([
  Type.Literal('openai'),
  Type.Literal('codex'),
  Type.Literal('anthropic'),
  Type.Literal('claude-code'),
  Type.Literal('google'),
]);
export type ModelApi = Static<typeof ModelApiSchema>;

export const ModelOptionDtoSchema = Type.Object(
  {
    modelId: CuratedModelIdSchema,
    label: Type.String(),
  },
  { additionalProperties: false }
);
export type ModelOptionDto = Static<typeof ModelOptionDtoSchema>;

export const ModelProviderDtoSchema = Type.Object(
  {
    api: ModelApiSchema,
    label: Type.String(),
    models: Type.Array(ModelOptionDtoSchema),
  },
  { additionalProperties: false }
);
export type ModelProviderDto = Static<typeof ModelProviderDtoSchema>;

export const ModelsCatalogResponseSchema = Type.Object(
  {
    providers: Type.Array(ModelProviderDtoSchema),
  },
  { additionalProperties: false }
);
export type ModelsCatalogResponse = Static<typeof ModelsCatalogResponseSchema>;
