import type { Model, StopReason, Usage, ZaiProviderOptions } from '@ank1015/llm-types';
import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import {
  buildParams,
  createClient,
  getAssistantStopReason,
  getResponseAssistantResponse,
  getResponseUsage,
} from './utils.js';
import type { CompleteFunction } from '../../utils/types.js';

export const completeZai: CompleteFunction<'zai'> = async (
  model: Model<'zai'>,
  context,
  options: ZaiProviderOptions,
  id: string
) => {
  const startTimestamp = Date.now();
  const client = createClient(model, options.apiKey!);
  const params = buildParams(model, context, options);

  try {
    const response: ChatCompletion = await client.chat.completions.create(params, {
      signal: options?.signal,
    });

    // Cache processed content for performance and consistency
    const content = getResponseAssistantResponse(response);
    const usage = getResponseUsage(response, model);
    let stopReason = getAssistantStopReason(response);

    // Ensure stopReason is toolUse if we have tool calls
    const hasToolCall = content.some((c) => c.type === 'toolCall');
    if (hasToolCall && stopReason === 'stop') {
      stopReason = 'toolUse';
    }

    return {
      role: 'assistant',
      message: response,
      id,
      api: model.api,
      model,
      timestamp: Date.now(),
      duration: Date.now() - startTimestamp,
      stopReason,
      content,
      usage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAborted = options.signal?.aborted;
    const stopReason: StopReason = isAborted ? 'aborted' : 'error';

    // Return error response with empty content and zero usage
    const emptyUsage: Usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };

    return {
      role: 'assistant',
      message: {} as ChatCompletion, // Empty response object for error case
      id,
      api: model.api,
      model,
      errorMessage,
      timestamp: Date.now(),
      duration: Date.now() - startTimestamp,
      stopReason,
      content: [],
      usage: emptyUsage,
    };
  }
};
