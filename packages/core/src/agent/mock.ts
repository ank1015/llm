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
export function getMockMessage<TApi extends Api>(model: Model<TApi>): BaseAssistantMessage<TApi> {
  const messageId = generateUUID();

  let nativeMessage: unknown;
  switch (model.api) {
    case 'anthropic':
      nativeMessage = getMockAnthropicMessage();
      break;
    case 'openai':
      nativeMessage = getMockOpenaiMessage();
      break;
    case 'google':
      nativeMessage = getMockGoogleMessage();
      break;
    case 'deepseek':
      nativeMessage = getMockDeepSeekMessage();
      break;
    case 'zai':
      nativeMessage = getMockZaiMessage();
      break;
    case 'kimi':
      nativeMessage = getMockKimiMessage();
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
