import {
  KnownApis,
  type AgentEvent,
  type Api,
  type Message,
  type MessageNode,
} from '@ank1015/llm-types';
import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const REASONING_LEVELS = ['low', 'medium', 'high', 'xhigh'] as const;
export type ReasoningLevelValue = (typeof REASONING_LEVELS)[number];
export type ReasoningLevel = ReasoningLevelValue;

const apiLiterals = KnownApis.map((api) => Type.Literal(api));
const reasoningLevelLiterals = REASONING_LEVELS.map((level) => Type.Literal(level));

export const ApiSchema = Type.Unsafe<Api>(
  Type.Union(apiLiterals as unknown as [TSchema, TSchema, ...TSchema[]])
);
export type ApiValue = Static<typeof ApiSchema>;
export type ApiContract = ApiValue;

export const ReasoningLevelSchema = Type.Unsafe<ReasoningLevelValue>(
  Type.Union(reasoningLevelLiterals as unknown as [TSchema, TSchema, TSchema, TSchema])
);
export type ReasoningLevelContract = Static<typeof ReasoningLevelSchema>;

export interface SessionRef {
  sessionId: string;
}

export interface ModelSelection {
  api: Api;
  modelId: string;
}

export interface TurnSettings extends ModelSelection {
  reasoningLevel: ReasoningLevel;
}

export interface VisibleLeafSelection {
  leafNodeId?: string;
}

export const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);

export const ErrorResponseSchema = Type.Object(
  {
    error: Type.String(),
  },
  { additionalProperties: false }
);
export type ErrorResponse = Static<typeof ErrorResponseSchema>;

export const MessageSchema = Type.Unsafe<Message>(
  Type.Object(
    {
      role: Type.String(),
    },
    { additionalProperties: true }
  )
);
export type MessageContract = Static<typeof MessageSchema>;

export const MessageNodeSchema = Type.Unsafe<MessageNode>(
  Type.Object(
    {
      type: Type.String(),
      id: Type.String(),
      parentId: Type.Union([Type.String(), Type.Null()]),
      branch: Type.String(),
      timestamp: Type.String(),
      message: MessageSchema,
      api: ApiSchema,
      modelId: Type.String(),
      providerOptions: Type.Record(Type.String(), Type.Unknown()),
    },
    { additionalProperties: true }
  )
);
export type MessageNodeContract = Static<typeof MessageNodeSchema>;

export const AgentEventSchema = Type.Unsafe<AgentEvent>(
  Type.Object(
    {
      type: Type.String(),
    },
    { additionalProperties: true }
  )
);
export type AgentEventContract = Static<typeof AgentEventSchema>;
