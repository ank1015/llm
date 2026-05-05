import { AzureOpenAI } from 'openai';
import { describe, expect, it } from 'vitest';

import { getImageModel, getImageModels } from '../../../src/images/models/index.js';
import {
  DEFAULT_AZURE_OPENAI_IMAGE_API_VERSION,
  buildAzureOpenAIImageGenerateBody,
  createAzureOpenAIImageClient,
  normalizeAzureOpenAIImageResponse,
  resolveAzureOpenAIImageConfig,
} from '../../../src/images/providers/azure-openai/generate.js';

import type {
  AzureOpenAIImageProviderOptions,
  ImageGenerationContext,
  ImageModel,
} from '../../../src/types/index.js';
import type { ImagesResponse } from 'openai/resources/images.js';

const mockModel: ImageModel<'azure-openai'> = {
  id: 'gpt-image-2',
  name: 'GPT Image 2',
  api: 'azure-openai',
  baseUrl: '',
  input: ['text', 'image'],
  output: ['image'],
  cost: {
    inputText: 5,
    inputImage: 8,
    outputText: 10,
    outputImage: 32,
    reasoning: 10,
  },
};

describe('azure openai image provider', () => {
  it('registers only the intended Azure OpenAI image model', () => {
    const models = getImageModels('azure-openai');

    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('gpt-image-2');
    expect(getImageModel('azure-openai', 'gpt-image-2')).toBeDefined();
  });

  it('normalizes a Responses target URI to the Azure Images client base URL and version', () => {
    const config = resolveAzureOpenAIImageConfig(mockModel, {
      apiKey: 'test-key',
      azureBaseURL:
        'https://example-resource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview',
    });

    expect(config).toEqual({
      apiVersion: '2025-04-01-preview',
      baseURL: 'https://example-resource.cognitiveservices.azure.com/openai',
    });
  });

  it('resolves base URL from endpoint and uses the image API-version default', () => {
    const config = resolveAzureOpenAIImageConfig(mockModel, {
      apiKey: 'test-key',
      azureEndpoint: 'https://example-resource.cognitiveservices.azure.com/',
    });

    expect(config).toEqual({
      apiVersion: DEFAULT_AZURE_OPENAI_IMAGE_API_VERSION,
      baseURL: 'https://example-resource.cognitiveservices.azure.com/openai',
    });
  });

  it('creates an Azure OpenAI client with the image deployment name', () => {
    const client = createAzureOpenAIImageClient(mockModel, {
      apiKey: 'test-key',
      azureBaseURL: 'https://example-resource.cognitiveservices.azure.com/openai',
      azureDeploymentName: 'prod-image-deployment',
    });

    expect(client).toBeInstanceOf(AzureOpenAI);
    expect(client.baseURL).toBe('https://example-resource.cognitiveservices.azure.com/openai');
    expect(client.apiVersion).toBe(DEFAULT_AZURE_OPENAI_IMAGE_API_VERSION);
    expect(client.deploymentName).toBe('prod-image-deployment');
  });

  it('builds a non-streaming generate request body and strips Azure-only options', () => {
    const context: ImageGenerationContext = {
      prompt: 'Create a watercolor fox reading under a tree',
    };
    const options: AzureOpenAIImageProviderOptions = {
      apiKey: 'test-key',
      azureBaseURL: 'https://example-resource.cognitiveservices.azure.com/openai',
      azureDeploymentName: 'prod-gpt-image-2',
      background: 'opaque',
      quality: 'low',
      size: '1024x1024',
      input_fidelity: 'high',
    };

    const result = buildAzureOpenAIImageGenerateBody(mockModel, context, options);

    expect(result).toEqual({
      model: 'prod-gpt-image-2',
      prompt: 'Create a watercolor fox reading under a tree',
      background: 'opaque',
      quality: 'low',
      size: '1024x1024',
      stream: false,
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('azureBaseURL');
    expect(result).not.toHaveProperty('azureDeploymentName');
    expect(result).not.toHaveProperty('input_fidelity');
  });

  it('normalizes generated images and usage details from the native response', () => {
    const response: ImagesResponse = {
      created: 123,
      output_format: 'png',
      data: [
        {
          b64_json: 'image-data-1',
          revised_prompt: 'A watercolor fox reading under a tree',
        },
      ],
      usage: {
        input_tokens: 90,
        input_tokens_details: {
          text_tokens: 30,
          image_tokens: 60,
        },
        output_tokens: 120,
        output_tokens_details: {
          text_tokens: 0,
          image_tokens: 120,
        },
        total_tokens: 210,
      },
    };

    const result = normalizeAzureOpenAIImageResponse(response, {
      apiKey: 'test-key',
      output_format: 'png',
    });

    expect(result.images).toEqual([
      {
        type: 'image',
        data: 'image-data-1',
        mimeType: 'image/png',
        metadata: {
          generationProvider: 'azure-openai',
          generationStage: 'final',
          imageIndex: 0,
          revisedPrompt: 'A watercolor fox reading under a tree',
        },
      },
    ]);
    expect(result.content).toEqual(result.images);
    expect(result.usage).toEqual({
      input: 90,
      inputText: 30,
      inputImage: 60,
      output: 120,
      outputText: 0,
      outputImage: 120,
      reasoning: 0,
      totalTokens: 210,
      cost: {
        inputText: 0,
        inputImage: 0,
        outputText: 0,
        outputImage: 0,
        reasoning: 0,
        total: 0,
      },
    });
  });

  it('treats Azure output tokens as image tokens when output details are omitted', () => {
    const response: ImagesResponse = {
      created: 123,
      output_format: 'png',
      data: [{ b64_json: 'image-data-1' }],
      usage: {
        input_tokens: 24,
        input_tokens_details: {
          text_tokens: 24,
          image_tokens: 0,
        },
        output_tokens: 196,
        total_tokens: 220,
      },
    };

    const result = normalizeAzureOpenAIImageResponse(response, {
      apiKey: 'test-key',
      output_format: 'png',
    });

    expect(result.usage.output).toBe(196);
    expect(result.usage.outputText).toBe(0);
    expect(result.usage.outputImage).toBe(196);
  });
});
