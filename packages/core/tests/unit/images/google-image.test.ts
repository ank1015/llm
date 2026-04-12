import { describe, expect, it } from 'vitest';

import { getImageModel, getImageModels } from '../../../src/images/models/index.js';
import {
  buildGoogleImageParams,
  normalizeGoogleImageResponse,
} from '../../../src/images/providers/google/generate.js';

import type {
  GoogleImageProviderOptions,
  ImageGenerationContext,
  ImageModel,
} from '../../../src/types/index.js';
import type { GenerateContentResponse } from '@google/genai';

const mockModel: ImageModel<'google'> = {
  id: 'gemini-3.1-flash-image-preview',
  name: 'Gemini 3.1 Flash Image Preview',
  api: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  input: ['text', 'image'],
  output: ['text', 'image'],
  cost: {
    inputText: 0.5,
    inputImage: 0.5,
    outputText: 3,
    outputImage: 60,
    reasoning: 3,
  },
};

describe('google image provider', () => {
  it('registers only the intended Google image models', () => {
    const models = getImageModels('google');

    expect(models.map((model) => model.id)).toEqual([
      'gemini-3.1-flash-image-preview',
      'gemini-3-pro-image-preview',
    ]);
    expect(getImageModel('google', 'gemini-3.1-flash-image-preview')).toBeDefined();
    expect(getImageModel('google', 'gemini-3-pro-image-preview')).toBeDefined();
  });

  it('builds image generation params with prompt, image references, and IMAGE modality enforced', () => {
    const context: ImageGenerationContext = {
      prompt: 'Turn this sketch into a polished poster',
      images: [
        {
          type: 'image',
          data: 'base64-image',
          mimeType: 'image/png',
        },
      ],
    };
    const options: GoogleImageProviderOptions = {
      apiKey: 'test-key',
      responseModalities: ['TEXT'],
      imageConfig: {
        aspectRatio: '16:9',
        imageSize: '2K',
      },
    };

    const result = buildGoogleImageParams(mockModel, context, options);

    expect(result).toEqual({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        { text: 'Turn this sketch into a polished poster' },
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'base64-image',
          },
        },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '2K',
        },
      },
    });
  });

  it('normalizes mixed text and image output along with modality-aware usage', () => {
    const response: GenerateContentResponse = {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [
              { text: 'Here is the first render.' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'img-1',
                },
              },
            ],
          },
        },
        {
          index: 1,
          content: {
            role: 'model',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'img-2',
                },
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 70,
        cachedContentTokenCount: 0,
        candidatesTokenCount: 110,
        thoughtsTokenCount: 12,
        totalTokenCount: 192,
        promptTokensDetails: [
          { modality: 'TEXT' as any, tokenCount: 18 },
          { modality: 'IMAGE' as any, tokenCount: 52 },
        ],
        candidatesTokensDetails: [
          { modality: 'TEXT' as any, tokenCount: 10 },
          { modality: 'IMAGE' as any, tokenCount: 100 },
        ],
      },
    };

    const result = normalizeGoogleImageResponse(response);

    expect(result.content).toEqual([
      {
        type: 'text',
        content: 'Here is the first render.',
        metadata: {
          candidateIndex: 0,
        },
      },
      {
        type: 'image',
        data: 'img-1',
        mimeType: 'image/png',
        metadata: {
          candidateIndex: 0,
          generationProvider: 'google',
          generationStage: 'final',
        },
      },
      {
        type: 'image',
        data: 'img-2',
        mimeType: 'image/png',
        metadata: {
          candidateIndex: 1,
          generationProvider: 'google',
          generationStage: 'final',
        },
      },
    ]);
    expect(result.images).toEqual([
      {
        type: 'image',
        data: 'img-1',
        mimeType: 'image/png',
        metadata: {
          candidateIndex: 0,
          generationProvider: 'google',
          generationStage: 'final',
        },
      },
      {
        type: 'image',
        data: 'img-2',
        mimeType: 'image/png',
        metadata: {
          candidateIndex: 1,
          generationProvider: 'google',
          generationStage: 'final',
        },
      },
    ]);
    expect(result.usage).toEqual({
      input: 70,
      inputText: 18,
      inputImage: 52,
      output: 122,
      outputText: 10,
      outputImage: 100,
      reasoning: 12,
      totalTokens: 192,
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
