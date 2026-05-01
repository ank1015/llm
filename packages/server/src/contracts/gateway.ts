import { Type } from '@sinclair/typebox';

import type { Static } from '@sinclair/typebox';

export const GatewaySessionSchema = Type.Object(
  {
    authenticated: Type.Boolean(),
    credentialsPath: Type.String(),
    gatewayBaseUrl: Type.String(),
    savedAt: Type.Optional(Type.String()),
    accessTokenExpiresAt: Type.Optional(Type.Number()),
    refreshTokenExpiresAt: Type.Optional(Type.Number()),
  },
  { additionalProperties: false }
);
export type GatewaySession = Static<typeof GatewaySessionSchema>;

export const GatewayLoginRequestSchema = Type.Object(
  {
    username: Type.Optional(Type.String()),
    password: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);
export type GatewayLoginRequest = Static<typeof GatewayLoginRequestSchema>;

export const GatewayLoginResultSchema = Type.Union([
  Type.Object(
    {
      ok: Type.Literal(true),
      session: GatewaySessionSchema,
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      ok: Type.Literal(false),
      message: Type.String(),
      session: GatewaySessionSchema,
    },
    { additionalProperties: false }
  ),
]);
export type GatewayLoginResult = Static<typeof GatewayLoginResultSchema>;
