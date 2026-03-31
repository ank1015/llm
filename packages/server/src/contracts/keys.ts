import { KnownKeyProviders } from '@ank1015/llm-sdk/keys';
import { Type, type Static, type TSchema } from '@sinclair/typebox';

const providerLiterals = KnownKeyProviders.map((provider) => Type.Literal(provider));

export const KeyProviderSchema = Type.Union(
  providerLiterals as unknown as [TSchema, TSchema, ...TSchema[]]
);
export type KeyProviderContract = Static<typeof KeyProviderSchema>;

export const KeyCredentialsSchema = Type.Record(Type.String(), Type.String());
export type KeyCredentials = Static<typeof KeyCredentialsSchema>;

export const KeyCredentialFieldDtoSchema = Type.Object(
  {
    option: Type.String(),
    env: Type.String(),
    aliases: Type.Array(Type.String()),
  },
  { additionalProperties: false }
);
export type KeyCredentialFieldDto = Static<typeof KeyCredentialFieldDtoSchema>;

export const KeyProviderStatusDtoSchema = Type.Object(
  {
    provider: KeyProviderSchema,
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
    provider: KeyProviderSchema,
    credentials: KeyCredentialsSchema,
    fields: Type.Array(KeyCredentialFieldDtoSchema),
  },
  { additionalProperties: false }
);
export type KeyProviderDetailsResponse = Static<typeof KeyProviderDetailsResponseSchema>;

export const SetKeyRequestSchema = Type.Object(
  {
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
