/**
 * SDK complete function
 *
 * Routes to core's complete function if apiKey is provided,
 * otherwise calls the server's /messages/complete endpoint.
 */

import { complete as coreComplete } from '@ank1015/llm-core';
import type {
  Api,
  BaseAssistantMessage,
  Context,
  Model,
  OptionsForApi,
  MessageRequest,
} from '@ank1015/llm-types';
import { ProviderError } from '@ank1015/llm-types';
import { getServerUrl } from '../config.js';

/**
 * Complete a chat request.
 *
 * If options.apiKey is provided, calls the provider directly via core.
 * Otherwise, calls the server which uses stored API keys and tracks usage.
 *
 * @param model - The model configuration
 * @param context - The conversation context (messages, system prompt, tools)
 * @param options - Provider-specific options (apiKey optional)
 * @param id - Unique request ID
 * @returns The assistant message response
 */
export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options: Partial<OptionsForApi<TApi>> = {},
  id?: string
): Promise<BaseAssistantMessage<TApi>> {
  // If apiKey is provided, use core's complete directly
  if ('apiKey' in options && options.apiKey) {
    const requestId = id ?? `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    return coreComplete(model, context, options as OptionsForApi<TApi>, requestId);
  }

  // Otherwise, call the server
  const serverUrl = getServerUrl();

  // Build request body
  const request: MessageRequest<TApi> = {
    api: model.api,
    modelId: model.id,
    messages: context.messages,
  };

  if (context.systemPrompt) {
    request.systemPrompt = context.systemPrompt;
  }

  if (context.tools) {
    request.tools = context.tools;
  }

  // Pass through provider options (excluding apiKey and signal)
  const {
    apiKey: _,
    signal,
    ...providerOptions
  } = options as Record<string, unknown> & { signal?: AbortSignal };
  if (Object.keys(providerOptions).length > 0) {
    request.providerOptions = providerOptions as Exclude<
      MessageRequest<TApi>['providerOptions'],
      undefined
    >;
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  };
  if (signal) {
    fetchOptions.signal = signal;
  }

  const response = await fetch(`${serverUrl}/messages/complete`, fetchOptions);

  if (!response.ok) {
    const errorData = await response.json();
    throw new ProviderError(model.api, errorData.message ?? 'Server request failed');
  }

  return response.json() as Promise<BaseAssistantMessage<TApi>>;
}
