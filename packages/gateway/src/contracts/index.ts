import { Type } from '@sinclair/typebox';

import type { Static } from '@sinclair/typebox';

export const ProviderOptionsSchema = Type.Record(Type.String(), Type.Any());

export const MessageEnvelopeSchema = Type.Array(Type.Any());
export const ToolEnvelopeSchema = Type.Array(Type.Any());

export const ImageContentSchema = Type.Object({
  type: Type.Literal('image'),
  data: Type.String(),
  mimeType: Type.String(),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

export const LlmStreamRequestSchema = Type.Object({
  api: Type.String({ minLength: 1 }),
  modelId: Type.String({ minLength: 1 }),
  messages: MessageEnvelopeSchema,
  systemPrompt: Type.Optional(Type.String()),
  tools: Type.Optional(ToolEnvelopeSchema),
  providerOptions: Type.Optional(ProviderOptionsSchema),
  requestId: Type.Optional(Type.String({ minLength: 1 })),
});

export const ImageGenerateRequestSchema = Type.Object({
  api: Type.String({ minLength: 1 }),
  modelId: Type.String({ minLength: 1 }),
  prompt: Type.String({ minLength: 1 }),
  images: Type.Optional(Type.Array(ImageContentSchema)),
  mask: Type.Optional(ImageContentSchema),
  providerOptions: Type.Optional(ProviderOptionsSchema),
  requestId: Type.Optional(Type.String({ minLength: 1 })),
});

export const RefreshTokenBodySchema = Type.Object({
  refreshToken: Type.String({ minLength: 1 }),
});

export const UserLoginBodySchema = Type.Object({
  username: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
});

export const CreateSenderBodySchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  username: Type.Optional(Type.String({ minLength: 1 })),
  password: Type.Optional(Type.String({ minLength: 8 })),
});

export const CreateUserBodySchema = Type.Object({
  username: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 8 }),
  name: Type.Optional(Type.String({ minLength: 1 })),
});

export const StoreProviderKeyBodySchema = Type.Object({
  apiKey: Type.String({ minLength: 1 }),
});

export const AdminRequestsQuerySchema = Type.Object({
  senderId: Type.Optional(Type.String()),
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
  limit: Type.Optional(Type.String()),
});

export const AdminUsageQuerySchema = Type.Object({
  senderId: Type.Optional(Type.String()),
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
});

export type AdminRequestsQuery = Static<typeof AdminRequestsQuerySchema>;
export type AdminUsageQuery = Static<typeof AdminUsageQuerySchema>;
export type CreateSenderBody = Static<typeof CreateSenderBodySchema>;
export type CreateUserBody = Static<typeof CreateUserBodySchema>;
export type ImageGenerateRequest = Static<typeof ImageGenerateRequestSchema>;
export type LlmStreamRequest = Static<typeof LlmStreamRequestSchema>;
export type RefreshTokenBody = Static<typeof RefreshTokenBodySchema>;
export type StoreProviderKeyBody = Static<typeof StoreProviderKeyBodySchema>;
export type UserLoginBody = Static<typeof UserLoginBodySchema>;
