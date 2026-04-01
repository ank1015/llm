import { randomUUID } from 'node:crypto';

import { stream } from '@ank1015/llm-core';

import { resolveModelInput } from './model-input.js';

import type {
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Context,
  Message,
  Tool,
} from '@ank1015/llm-core';
import type {
  AnthropicModelId,
  ClaudeCodeModelId,
  CodexModelId,
  CuratedModelId,
  GoogleModelId,
  OpenAIModelId,
  ProviderOptionsForModelId,
  ReasoningEffort,
  ResolveModelInputError,
} from './model-input.js';

type SetupFailure = {
  modelId: string;
  keysFilePath: string;
  error: ResolveModelInputError;
};

type StreamLike<TApi extends Api> = AsyncIterable<BaseAssistantEvent<TApi>> & {
  drain(): Promise<BaseAssistantMessage<TApi>>;
};

type RunConsumptionState = 'none' | 'active' | 'closed' | 'completed';

export type ApiForModelId<TModelId extends CuratedModelId> = TModelId extends OpenAIModelId
  ? 'openai'
  : TModelId extends CodexModelId
    ? 'codex'
    : TModelId extends AnthropicModelId
      ? 'anthropic'
      : TModelId extends ClaudeCodeModelId
        ? 'claude-code'
        : TModelId extends GoogleModelId
          ? 'google'
          : never;

export interface LlmInput<TModelId extends CuratedModelId = CuratedModelId> {
  modelId: TModelId;
  messages: Message[];
  system?: string;
  tools?: Tool[];
  reasoningEffort?: ReasoningEffort;
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string;
  signal?: AbortSignal;
  requestId?: string;
}

export interface LlmRun<TApi extends Api = Api>
  extends AsyncIterable<BaseAssistantEvent<TApi>>,
    PromiseLike<BaseAssistantMessage<TApi>> {
  drain(): Promise<BaseAssistantMessage<TApi>>;
  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<BaseAssistantMessage<TApi> | TResult>;
  finally(onFinally?: (() => void) | null): Promise<BaseAssistantMessage<TApi>>;
}

export class LlmRunConsumptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmRunConsumptionError';
  }
}

export class LlmInputError extends Error {
  readonly code: ResolveModelInputError['code'];
  readonly details: ResolveModelInputError;
  readonly modelId: string;
  readonly keysFilePath: string;

  constructor(failure: SetupFailure) {
    super(failure.error.message);
    this.name = 'LlmInputError';
    this.code = failure.error.code;
    this.details = failure.error;
    this.modelId = failure.modelId;
    this.keysFilePath = failure.keysFilePath;
  }
}

export function llm<TModelId extends CuratedModelId>(
  input: LlmInput<TModelId>
): LlmRun<ApiForModelId<TModelId>> {
  const streamPromise = createLlmStream(input);
  let drainPromise: Promise<BaseAssistantMessage<ApiForModelId<TModelId>>> | undefined;
  let consumptionState: RunConsumptionState = 'none';

  const drain = (): Promise<BaseAssistantMessage<ApiForModelId<TModelId>>> => {
    if (consumptionState === 'active') {
      return Promise.reject(
        new LlmRunConsumptionError(
          'Cannot await or drain a LlmRun while its async iterator is still being consumed. Finish the for await loop first, or do not iterate and just await/drain the run.'
        )
      );
    }

    if (!drainPromise) {
      drainPromise = streamPromise.then((eventStream) => eventStream.drain());
    }

    return drainPromise;
  };

  const run: LlmRun<ApiForModelId<TModelId>> = {
    async *[Symbol.asyncIterator]() {
      if (drainPromise) {
        throw new LlmRunConsumptionError(
          'Cannot iterate a LlmRun after await()/then()/catch()/finally()/drain() consumption has started. Use either await/drain, or iterate first and await after the loop finishes.'
        );
      }

      if (consumptionState !== 'none') {
        throw new LlmRunConsumptionError('LlmRun only supports a single async iterator consumer.');
      }

      consumptionState = 'active';

      try {
        const eventStream = await streamPromise;
        for await (const event of eventStream) {
          yield event;
        }
        consumptionState = 'completed';
      } finally {
        if (consumptionState === 'active') {
          consumptionState = 'closed';
        }
      }
    },
    drain,
    then<TResult1 = BaseAssistantMessage<ApiForModelId<TModelId>>, TResult2 = never>(
      onFulfilled?:
        | ((value: BaseAssistantMessage<ApiForModelId<TModelId>>) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return drain().then(onFulfilled, onRejected);
    },
    catch<TResult = never>(
      onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
    ): Promise<BaseAssistantMessage<ApiForModelId<TModelId>> | TResult> {
      return drain().catch(onRejected);
    },
    finally(onFinally?: (() => void) | null): Promise<BaseAssistantMessage<ApiForModelId<TModelId>>> {
      return drain().finally(onFinally);
    },
  };

  return run;
}

async function createLlmStream<TModelId extends CuratedModelId>(
  input: LlmInput<TModelId>
): Promise<StreamLike<ApiForModelId<TModelId>>> {
  const resolved = await resolveModelInput({
    modelId: input.modelId,
    ...(input.reasoningEffort !== undefined ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.overrideProviderSetting !== undefined
      ? { overrideProviderSetting: input.overrideProviderSetting }
      : {}),
    ...(input.keysFilePath !== undefined ? { keysFilePath: input.keysFilePath } : {}),
  });

  if (!resolved.ok) {
    throw new LlmInputError(resolved);
  }

  const context: Context = {
    messages: [...input.messages],
  };

  if (input.system !== undefined) {
    context.systemPrompt = input.system;
  }

  if (input.tools !== undefined) {
    context.tools = [...input.tools];
  }

  const providerOptions = withSignal(resolved.providerOptions, input.signal);

  return stream(
    resolved.model as never,
    context,
    providerOptions as never,
    input.requestId ?? randomUUID()
  ) as StreamLike<ApiForModelId<TModelId>>;
}

function withSignal<TProviderOptions extends object>(
  providerOptions: TProviderOptions,
  signal: AbortSignal | undefined
): TProviderOptions {
  if (!signal) {
    return providerOptions;
  }

  return {
    ...providerOptions,
    signal,
  };
}
