import { getProviderMockMessage } from '../providers/registry.js';
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

  const mockFn = getProviderMockMessage(model.api);
  if (!mockFn) {
    throw new Error(`Unsupported API: ${model.api}`);
  }
  const nativeMessage = mockFn(model.id, id);

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
