import { complete as llmComplete } from './complete.js';
import { stream as llmStream } from './stream.js';
import { Api, Model, Context, OptionsForApi, BaseAssistantMessage } from '@ank1015/llm-types';
import {
  AssistantMessageEventStream,
  generateUUID,
  getMockAnthropicMessage,
  getMockDeepSeekMessage,
  getMockGoogleMessage,
  getMockKimiMessage,
  getMockOpenaiMessage,
  getMockZaiMessage,
} from '@ank1015/llm-core';

export interface LLMClient {
  complete<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    options?: OptionsForApi<TApi>,
    id?: string
  ): Promise<BaseAssistantMessage<TApi>>;

  stream<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    options?: OptionsForApi<TApi>,
    id?: string
  ): AssistantMessageEventStream<TApi>;
}

export class DefaultLLMClient implements LLMClient {
  async complete<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    options?: OptionsForApi<TApi>,
    id?: string
  ): Promise<BaseAssistantMessage<TApi>> {
    return llmComplete(model, context, options, id);
  }

  stream<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    options?: OptionsForApi<TApi>,
    id?: string
  ): AssistantMessageEventStream<TApi> {
    return llmStream(model, context, options, id);
  }
}

export function getMockMessage(model: Model<Api>): BaseAssistantMessage<Api> {
  const messageId = generateUUID();
  let message;
  if (model.api === 'openai') {
    message = getMockOpenaiMessage();
  } else if (model.api === 'google') {
    message = getMockGoogleMessage();
  } else if (model.api === 'deepseek') {
    message = getMockDeepSeekMessage();
  } else if (model.api === 'anthropic') {
    message = getMockAnthropicMessage();
  } else if (model.api === 'zai') {
    message = getMockZaiMessage();
  } else if (model.api === 'kimi') {
    message = getMockKimiMessage();
  }
  const baseMessage: BaseAssistantMessage<Api> = {
    role: 'assistant',
    message: message!,
    api: model.api,
    id: messageId,
    model: model,
    timestamp: Date.now(),
    duration: 0,
    stopReason: 'stop',
    content: [],
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  return baseMessage;
}
