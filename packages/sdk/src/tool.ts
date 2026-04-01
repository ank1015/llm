import type { AgentTool, AgentToolResult, Message } from '@ank1015/llm-core';
import type { Static, TSchema } from '@sinclair/typebox';

type MaybePromise<T> = T | Promise<T>;

export type ToolResult<TDetails = unknown> = AgentToolResult<TDetails>;

export type ToolUpdateCallback<TDetails = unknown> = (
  partialResult: ToolResult<TDetails>
) => MaybePromise<void>;

export interface ToolContext<TDetails = unknown> {
  messages: readonly Message[];
  toolCallId: string;
  signal?: AbortSignal;
  update: ToolUpdateCallback<TDetails>;
}

export interface ToolDefinition<
  TParameters extends TSchema = TSchema,
  TDetails = unknown,
  TName extends string = string,
> {
  name: TName;
  description: string;
  parameters: TParameters;
  execute: (
    params: Static<TParameters>,
    context: ToolContext<TDetails>
  ) => MaybePromise<ToolResult<TDetails>>;
}

export function tool<
  TParameters extends TSchema,
  TDetails = unknown,
  TName extends string = string,
>(
  definition: ToolDefinition<TParameters, TDetails, TName>
): AgentTool<TParameters, TDetails> {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    execute: async (input) => {
      const context: ToolContext<TDetails> = {
        messages: input.context.messages,
        toolCallId: input.toolCallId,
        ...(input.signal ? { signal: input.signal } : {}),
        update: async (partialResult) => {
          if (input.onUpdate) {
            await input.onUpdate(partialResult);
          }
        },
      };

      return definition.execute(input.params, context);
    },
  };
}
