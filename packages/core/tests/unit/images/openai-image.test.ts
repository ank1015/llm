import { describe, expect, it } from 'vitest';

import { getImageModel, getImageModels } from '../../../src/images/models/index.js';
import {
  buildOpenAIImageGenerateBody,
  normalizeOpenAIImageResponse,
} from '../../../src/images/providers/openai/generate.js';

import type {
  ImageGenerationContext,
  ImageModel,
  OpenAIImageProviderOptions,
} from '../../../src/types/index.js';
import type { ImagesResponse } from 'openai/resources/images.js';

const mockModel: ImageModel<'openai'> = {
  id: 'gpt-image-1.5',
  name: 'GPT Image 1.5',
  api: 'openai',
  baseUrl: 'https://api.openai.com/v1',
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

describe('openai image provider', () => {
  it('registers only the intended OpenAI image model', () => {
    const models = getImageModels('openai');

    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe('gpt-image-1.5');
    expect(getImageModel('openai', 'gpt-image-1.5')).toBeDefined();
  });

  it('builds a non-streaming generate request body from the shared image context', () => {
    const context: ImageGenerationContext = {
      prompt: 'Create a watercolor fox reading under a tree',
    };
    const options: OpenAIImageProviderOptions = {
      apiKey: 'test-key',
      background: 'transparent',
      quality: 'high',
      size: '1536x1024',
      input_fidelity: 'high',
    };

    const result = buildOpenAIImageGenerateBody(mockModel, context, options);

    expect(result).toEqual({
      model: 'gpt-image-1.5',
      prompt: 'Create a watercolor fox reading under a tree',
      background: 'transparent',
      quality: 'high',
      size: '1536x1024',
      stream: false,
    });
  });

  it('normalizes generated images and usage details from the native response', () => {
    const response: ImagesResponse = {
      created: 123,
      output_format: 'webp',
      data: [
        {
          b64_json: 'image-data-1',
          revised_prompt: 'A watercolor fox reading under a tree',
        },
        {
          b64_json: 'image-data-2',
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

    const result = normalizeOpenAIImageResponse(response, {
      apiKey: 'test-key',
      output_format: 'webp',
    });

    expect(result.images).toEqual([
      {
        type: 'image',
        data: 'image-data-1',
        mimeType: 'image/webp',
        metadata: {
          generationProvider: 'openai',
          generationStage: 'final',
          imageIndex: 0,
          revisedPrompt: 'A watercolor fox reading under a tree',
        },
      },
      {
        type: 'image',
        data: 'image-data-2',
        mimeType: 'image/webp',
        metadata: {
          generationProvider: 'openai',
          generationStage: 'final',
          imageIndex: 1,
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
});
