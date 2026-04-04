import { describe, expect, it } from 'vitest';

import {
  calculateMusicCost,
  getMusicModel,
  getMusicModels,
} from '../../../src/music/models/index.js';
import {
  buildGoogleMusicParams,
  normalizeGoogleMusicResponse,
} from '../../../src/music/providers/google/generate.js';

import type {
  GoogleMusicProviderOptions,
  MusicGenerationContext,
  MusicModel,
} from '../../../src/types/index.js';
import type { GenerateContentResponse } from '@google/genai';

const clipModel: MusicModel<'google'> = {
  id: 'lyria-3-clip-preview',
  name: 'Lyria 3 Clip Preview',
  api: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  input: ['text', 'image'],
  output: ['text', 'audio'],
  cost: {
    request: 0.04,
  },
  capabilities: {
    maxImages: 10,
    fixedDurationSeconds: 30,
    supportsPromptControlledDuration: false,
    defaultMimeType: 'audio/mpeg',
    supportedMimeTypes: ['audio/mpeg'],
  },
};

const proModel: MusicModel<'google'> = {
  id: 'lyria-3-pro-preview',
  name: 'Lyria 3 Pro Preview',
  api: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  input: ['text', 'image'],
  output: ['text', 'audio'],
  cost: {
    request: 0.08,
  },
  capabilities: {
    maxImages: 10,
    supportsPromptControlledDuration: true,
    defaultMimeType: 'audio/mpeg',
    supportedMimeTypes: ['audio/mpeg', 'audio/wav'],
  },
};

describe('google music provider', () => {
  it('registers only the intended Google music models', () => {
    const models = getMusicModels('google');

    expect(models.map((model) => model.id)).toEqual([
      'lyria-3-clip-preview',
      'lyria-3-pro-preview',
    ]);
    expect(getMusicModel('google', 'lyria-3-clip-preview')).toBeDefined();
    expect(getMusicModel('google', 'lyria-3-pro-preview')).toBeDefined();
  });

  it('calculates per-request music cost from the model catalog', () => {
    expect(calculateMusicCost(clipModel)).toEqual({
      request: 0.04,
      total: 0.04,
    });
    expect(calculateMusicCost(proModel)).toEqual({
      request: 0.08,
      total: 0.08,
    });
  });

  it('builds music generation params with prompt, image references, and AUDIO modality enforced', () => {
    const context: MusicGenerationContext = {
      prompt: 'Create a dreamy synth-pop chorus inspired by this image.',
      images: [
        {
          type: 'image',
          data: 'base64-image',
          mimeType: 'image/png',
        },
      ],
    };
    const options: GoogleMusicProviderOptions = {
      apiKey: 'test-key',
      responseModalities: ['TEXT'],
      responseMimeType: 'audio/wav',
    };

    const result = buildGoogleMusicParams(proModel, context, options);

    expect(result).toEqual({
      model: 'lyria-3-pro-preview',
      contents: [
        {
          text: 'Create a dreamy synth-pop chorus inspired by this image.',
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: 'base64-image',
          },
        },
      ],
      config: {
        responseModalities: ['TEXT', 'AUDIO'],
        responseMimeType: 'audio/wav',
      },
    });
  });

  it('rejects unsupported response mime types for the clip model', () => {
    expect(() =>
      buildGoogleMusicParams(
        clipModel,
        {
          prompt: 'Generate a short folk melody.',
        },
        {
          apiKey: 'test-key',
          responseMimeType: 'audio/wav',
        }
      )
    ).toThrow(/does not support responseMimeType/);
  });

  it('rejects more than ten image references', () => {
    expect(() =>
      buildGoogleMusicParams(
        proModel,
        {
          prompt: 'Compose a track inspired by all of these images.',
          images: Array.from({ length: 11 }, (_, imageIndex) => ({
            type: 'image' as const,
            data: `image-${imageIndex}`,
            mimeType: 'image/png',
          })),
        },
        {
          apiKey: 'test-key',
        }
      )
    ).toThrow(/supports up to 10 input images/);
  });

  it('normalizes mixed text and audio output along with modality-aware usage', () => {
    const response: GenerateContentResponse = {
      candidates: [
        {
          index: 0,
          content: {
            role: 'model',
            parts: [
              {
                text: '[Verse] Neon rain across the avenue',
              },
              {
                inlineData: {
                  data: 'track-1',
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
                  mimeType: 'audio/mpeg',
                  data: 'track-2',
                },
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 90,
        cachedContentTokenCount: 0,
        candidatesTokenCount: 200,
        thoughtsTokenCount: 6,
        totalTokenCount: 296,
        promptTokensDetails: [
          { modality: 'TEXT' as any, tokenCount: 50 },
          { modality: 'IMAGE' as any, tokenCount: 40 },
        ],
        candidatesTokensDetails: [
          { modality: 'TEXT' as any, tokenCount: 12 },
          { modality: 'AUDIO' as any, tokenCount: 188 },
        ],
      },
    };

    const result = normalizeGoogleMusicResponse(proModel, response, {
      responseMimeType: 'audio/wav',
    });

    expect(result.content).toEqual([
      {
        type: 'text',
        content: '[Verse] Neon rain across the avenue',
        metadata: {
          candidateIndex: 0,
        },
      },
      {
        type: 'audio',
        data: 'track-1',
        mimeType: 'audio/wav',
        metadata: {
          candidateIndex: 0,
          generationProvider: 'google',
          generationStage: 'final',
          trackIndex: 0,
        },
      },
      {
        type: 'audio',
        data: 'track-2',
        mimeType: 'audio/mpeg',
        metadata: {
          candidateIndex: 1,
          generationProvider: 'google',
          generationStage: 'final',
          trackIndex: 1,
        },
      },
    ]);
    expect(result.tracks).toEqual([
      {
        type: 'audio',
        data: 'track-1',
        mimeType: 'audio/wav',
        metadata: {
          candidateIndex: 0,
          generationProvider: 'google',
          generationStage: 'final',
          trackIndex: 0,
        },
      },
      {
        type: 'audio',
        data: 'track-2',
        mimeType: 'audio/mpeg',
        metadata: {
          candidateIndex: 1,
          generationProvider: 'google',
          generationStage: 'final',
          trackIndex: 1,
        },
      },
    ]);
    expect(result.usage).toEqual({
      input: 90,
      inputText: 50,
      inputImage: 40,
      output: 206,
      outputText: 12,
      outputAudio: 188,
      reasoning: 6,
      requests: 1,
      totalTokens: 296,
      cost: {
        request: 0,
        total: 0,
      },
    });
  });
});
