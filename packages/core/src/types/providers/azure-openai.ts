/**
 * Azure OpenAI provider types
 */

import type { Response, ResponseCreateParamsBase } from 'openai/resources/responses/responses.js';

/**
 * Azure OpenAI native response type
 */
export type AzureOpenAINativeResponse = Response;

/**
 * Additional properties for Azure OpenAI provider
 */
interface AzureOpenAIProps {
  apiKey: string;
  signal?: AbortSignal;
  azureApiVersion?: string;
  azureBaseURL?: string;
  azureEndpoint?: string;
  azureResourceName?: string;
  azureDeploymentName?: string;
}

/**
 * Azure OpenAI provider options
 *
 * Extends OpenAI's ResponseCreateParamsBase with Azure-specific client settings,
 * omitting fields that are managed by core.
 */
export type AzureOpenAIProviderOptions = Omit<ResponseCreateParamsBase, 'model' | 'input'> &
  AzureOpenAIProps;
