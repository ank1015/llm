import { AzureOpenAI } from 'openai';

import { buildOpenAIMessages, convertTools, getMockOpenaiMessage } from '../openai/utils.js';

import type { AzureOpenAIProviderOptions, Context, Model } from '../../types/index.js';
import type {
  Tool as OpenAITool,
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses.js';

export const DEFAULT_AZURE_OPENAI_API_VERSION = 'v1';

interface ResolvedAzureOpenAIConfig {
  apiVersion: string;
  baseURL: string;
}

export function resolveDeploymentName(
  model: Model<'azure-openai'>,
  options: AzureOpenAIProviderOptions
): string {
  return options.azureDeploymentName?.trim() || model.id;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/u, '');
}

function isValidBaseURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildEndpointBaseURL(endpoint: string): string {
  return `${normalizeBaseURL(endpoint)}/openai/v1`;
}

function buildResourceBaseURL(resourceName: string): string {
  return `https://${resourceName.trim()}.openai.azure.com/openai/v1`;
}

export function resolveAzureOpenAIConfig(
  model: Model<'azure-openai'>,
  options: AzureOpenAIProviderOptions
): ResolvedAzureOpenAIConfig {
  const apiVersion = options.azureApiVersion?.trim() || DEFAULT_AZURE_OPENAI_API_VERSION;
  const candidates = [
    options.azureBaseURL?.trim(),
    options.azureEndpoint?.trim() ? buildEndpointBaseURL(options.azureEndpoint) : undefined,
    options.azureResourceName?.trim() ? buildResourceBaseURL(options.azureResourceName) : undefined,
    model.baseUrl.trim() ? model.baseUrl : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = normalizeBaseURL(candidate);
    if (isValidBaseURL(normalized)) {
      return {
        apiVersion,
        baseURL: normalized,
      };
    }
  }

  throw new Error(
    'Azure OpenAI base URL is required. Pass azureBaseURL, azureEndpoint, azureResourceName, or configure model.baseUrl.'
  );
}

export function createClient(
  model: Model<'azure-openai'>,
  options: AzureOpenAIProviderOptions
): AzureOpenAI {
  if (!options.apiKey) {
    throw new Error('Azure OpenAI API key is required.');
  }

  const { apiVersion, baseURL } = resolveAzureOpenAIConfig(model, options);

  return new AzureOpenAI({
    apiKey: options.apiKey,
    apiVersion,
    baseURL,
    dangerouslyAllowBrowser: true,
    defaultHeaders: model.headers,
  });
}

export function buildParams(
  model: Model<'azure-openai'>,
  context: Context,
  options: AzureOpenAIProviderOptions
): ResponseCreateParamsNonStreaming {
  const messages = buildOpenAIMessages(model, context);
  const deploymentName = resolveDeploymentName(model, options);

  const {
    apiKey,
    signal,
    azureApiVersion,
    azureBaseURL,
    azureEndpoint,
    azureResourceName,
    azureDeploymentName,
    ...openaiOptions
  } = options;
  void apiKey;
  void signal;
  void azureApiVersion;
  void azureBaseURL;
  void azureEndpoint;
  void azureResourceName;
  void azureDeploymentName;

  const params: ResponseCreateParamsNonStreaming = {
    ...openaiOptions,
    stream: false,
  };

  params.model = deploymentName;
  params.input = messages;

  const tools: OpenAITool[] = [];

  if (context.tools && model.tools.includes('function_calling')) {
    const convertedTools = convertTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }
  }

  if (openaiOptions.tools) {
    for (const optionTool of openaiOptions.tools) {
      tools.push(optionTool);
    }
  }

  params.tools = tools;
  return params;
}

export function getMockAzureOpenAIMessage(modelId: string, requestId: string): Response {
  return getMockOpenaiMessage(modelId, requestId);
}
