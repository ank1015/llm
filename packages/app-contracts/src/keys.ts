import { Type, type Static } from '@sinclair/typebox';

import { ApiSchema } from './common.js';

export const KeyCredentialsSchema = Type.Record(Type.String(), Type.String());
export type KeyCredentials = Static<typeof KeyCredentialsSchema>;

export const KeyProviderStatusDtoSchema = Type.Object(
  {
    api: ApiSchema,
    hasKey: Type.Boolean(),
    credentials: Type.Optional(KeyCredentialsSchema),
  },
  { additionalProperties: false }
);
export type KeyProviderStatusDto = Static<typeof KeyProviderStatusDtoSchema>;

export const KeysListResponseSchema = Type.Object(
  {
    providers: Type.Array(KeyProviderStatusDtoSchema),
  },
  { additionalProperties: false }
);
export type KeysListResponse = Static<typeof KeysListResponseSchema>;

export const KeyProviderDetailsResponseSchema = Type.Object(
  {
    credentials: KeyCredentialsSchema,
  },
  { additionalProperties: false }
);
export type KeyProviderDetailsResponse = Static<typeof KeyProviderDetailsResponseSchema>;

export const SetKeyRequestSchema = Type.Object(
  {
    key: Type.Optional(Type.String()),
    credentials: Type.Optional(KeyCredentialsSchema),
  },
  { additionalProperties: false }
);
export type SetKeyRequest = Static<typeof SetKeyRequestSchema>;

export const SetKeyResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type SetKeyResponse = Static<typeof SetKeyResponseSchema>;

export const DeleteKeyResponseSchema = Type.Object(
  {
    deleted: Type.Boolean(),
  },
  { additionalProperties: false }
);
export type DeleteKeyResponse = Static<typeof DeleteKeyResponseSchema>;

export const ReloadKeyResponseSchema = Type.Object(
  {
    ok: Type.Literal(true),
  },
  { additionalProperties: false }
);
export type ReloadKeyResponse = Static<typeof ReloadKeyResponseSchema>;
