import { Type } from '@sinclair/typebox';

import type { AgentEvent, Message } from '@ank1015/llm-sdk';
import type { SessionMessageNode } from '../types/index.js';

export const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);

export const MessageSchema = Type.Unsafe<Message>(
  Type.Object(
    {
      role: Type.String(),
    },
    { additionalProperties: true }
  )
);

export const SessionMessageNodeSchema = Type.Unsafe<SessionMessageNode>(
  Type.Object(
    {
      type: Type.Literal('message'),
      id: Type.String(),
      parentId: Type.String(),
      branch: Type.String(),
      timestamp: Type.String(),
      message: MessageSchema,
      metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    },
    { additionalProperties: true }
  )
);

export const AgentEventSchema = Type.Unsafe<AgentEvent>(
  Type.Object(
    {
      type: Type.String(),
    },
    { additionalProperties: true }
  )
);
