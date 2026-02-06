import { getMockAnthropicMessage } from '../providers/anthropic/utils.js';
import { getMockDeepSeekMessage } from '../providers/deepseek/utils.js';
import { getMockGoogleMessage } from '../providers/google/utils.js';
import { getMockKimiMessage } from '../providers/kimi/utils.js';
import { getMockOpenaiMessage } from '../providers/openai/utils.js';
import { getMockZaiMessage } from '../providers/zai/utils.js';
import { generateUUID } from '../utils/uuid.js';

import type { Api, BaseAssistantMessage, Model } from '@ank1015/llm-types';

/**
 * Creates a mock BaseAssistantMessage for the given model.
 * Used for emitting initial message_start events before the actual response.
 */
export function getMockMessage<TApi extends Api>(
  model: Model<TApi>,
  messageId?: string
): BaseAssistantMessage<TApi> {
  const id = messageId ?? generateUUID();

  let nativeMessage: unknown;
  switch (model.api) {
    case 'anthropic':
      nativeMessage = getMockAnthropicMessage(model.id, id);
      break;
    case 'openai':
      nativeMessage = getMockOpenaiMessage(model.id, id);
      break;
    case 'google':
      nativeMessage = getMockGoogleMessage();
      break;
    case 'deepseek':
      nativeMessage = getMockDeepSeekMessage(model.id, id);
      break;
    case 'zai':
      nativeMessage = getMockZaiMessage(model.id, id);
      break;
    case 'kimi':
      nativeMessage = getMockKimiMessage(model.id, id);
      break;
    default: {
      const _exhaustive: never = model.api;
      throw new Error(`Unsupported API: ${_exhaustive}`);
    }
  }

  const baseMessage: BaseAssistantMessage<TApi> = {
    role: 'assistant',
    message: nativeMessage as BaseAssistantMessage<TApi>['message'],
    api: model.api,
    id: id,
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
