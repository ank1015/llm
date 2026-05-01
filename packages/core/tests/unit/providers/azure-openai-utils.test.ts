import { Type } from '@sinclair/typebox';
import { AzureOpenAI } from 'openai';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AZURE_OPENAI_API_VERSION,
  buildParams,
  createClient,
  resolveAzureOpenAIConfig,
  resolveDeploymentName,
} from '../../../src/providers/azure-openai/utils.js';

import type {
  AzureOpenAIProviderOptions,
  BaseAssistantMessage,
  Context,
  Model,
  Tool,
} from '../../../src/types/index.js';
import type { Response } from 'openai/resources/responses/responses.js';

describe('Azure OpenAI Utils', () => {
  const mockModel: Model<'azure-openai'> = {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    api: 'azure-openai',
    baseUrl: '',
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000,
    tools: ['function_calling'],
  };

  const baseOptions: AzureOpenAIProviderOptions = {
    apiKey: 'test-key',
    azureBaseURL: 'https://example-resource.openai.azure.com/openai/v1',
  };

  describe('createClient', () => {
    it('should create an Azure OpenAI client with provided API key', () => {
      const client = createClient(mockModel, baseOptions);

      expect(client).toBeInstanceOf(AzureOpenAI);
      expect(client.baseURL).toBe('https://example-resource.openai.azure.com/openai/v1');
      expect(client.apiVersion).toBe(DEFAULT_AZURE_OPENAI_API_VERSION);
    });

    it('should use explicit API version', () => {
      const client = createClient(mockModel, {
        ...baseOptions,
        azureApiVersion: '2025-04-01-preview',
      });

      expect(client.apiVersion).toBe('2025-04-01-preview');
    });

    it('should resolve base URL from endpoint', () => {
      const config = resolveAzureOpenAIConfig(mockModel, {
        apiKey: 'test-key',
        azureEndpoint: 'https://endpoint-resource.openai.azure.com/',
      });

      expect(config.baseURL).toBe('https://endpoint-resource.openai.azure.com/openai/v1');
    });

    it('should resolve base URL from resource name', () => {
      const config = resolveAzureOpenAIConfig(mockModel, {
        apiKey: 'test-key',
        azureResourceName: 'resource-name',
      });

      expect(config.baseURL).toBe('https://resource-name.openai.azure.com/openai/v1');
    });

    it('should fall back to a valid model base URL', () => {
      const config = resolveAzureOpenAIConfig(
        {
          ...mockModel,
          baseUrl: 'https://model-resource.openai.azure.com/openai/v1/',
        },
        { apiKey: 'test-key' }
      );

      expect(config.baseURL).toBe('https://model-resource.openai.azure.com/openai/v1');
    });

    it('should throw when no valid base URL is configured', () => {
      expect(() => resolveAzureOpenAIConfig(mockModel, { apiKey: 'test-key' })).toThrow(
        'Azure OpenAI base URL is required'
      );
    });

    it('should throw when API key is missing', () => {
      expect(() => createClient(mockModel, { ...baseOptions, apiKey: '' })).toThrow(
        'Azure OpenAI API key is required.'
      );
    });
  });

  describe('buildParams', () => {
    it('should default deployment name to model ID', () => {
      expect(resolveDeploymentName(mockModel, baseOptions)).toBe('gpt-5.4');
    });

    it('should allow azureDeploymentName to override request model', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        ...baseOptions,
        azureDeploymentName: 'prod-gpt-54',
      });

      expect(result.model).toBe('prod-gpt-54');
    });

    it('should strip Azure-only options from Responses params', () => {
      const context: Context = { messages: [] };
      const result = buildParams(mockModel, context, {
        ...baseOptions,
        azureApiVersion: '2025-04-01-preview',
        azureEndpoint: 'https://endpoint.openai.azure.com',
        azureResourceName: 'resource-name',
        azureDeploymentName: 'deployment',
        temperature: 0.2,
      });

      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('signal');
      expect(result).not.toHaveProperty('azureApiVersion');
      expect(result).not.toHaveProperty('azureBaseURL');
      expect(result).not.toHaveProperty('azureEndpoint');
      expect(result).not.toHaveProperty('azureResourceName');
      expect(result).not.toHaveProperty('azureDeploymentName');
      expect(result.temperature).toBe(0.2);
    });

    it('should preserve Azure OpenAI native assistant messages', () => {
      const assistantMessage: BaseAssistantMessage<'azure-openai'> = {
        role: 'assistant',
        id: 'msg-1',
        api: 'azure-openai',
        model: mockModel,
        timestamp: Date.now(),
        duration: 10,
        stopReason: 'stop',
        content: [],
        usage: {
          input: 1,
          output: 2,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 3,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        message: {
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Hello from Azure' }],
            },
          ],
        } as Response,
      };
      const context: Context = { messages: [assistantMessage] };

      const result = buildParams(mockModel, context, baseOptions);

      expect(result.input[0]).toEqual({
        type: 'message',
        content: [{ type: 'output_text', text: 'Hello from Azure' }],
      });
    });

    it('should merge context tools and provider option tools', () => {
      const contextTool: Tool = {
        name: 'search',
        description: 'Search',
        parameters: Type.Object({ query: Type.String() }),
      };
      const optionTool = {
        type: 'function' as const,
        name: 'extra',
        description: 'Extra tool',
        parameters: {},
        strict: null,
      };
      const context: Context = { messages: [], tools: [contextTool] };

      const result = buildParams(mockModel, context, {
        ...baseOptions,
        tools: [optionTool],
      });

      expect(result.tools).toHaveLength(2);
      expect(result.tools?.[0]).toMatchObject({ type: 'function', name: 'search' });
      expect(result.tools?.[1]).toEqual(optionTool);
    });
  });
});
