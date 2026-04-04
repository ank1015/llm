import { describe, expect, it, vi } from 'vitest';

import { calculateImageCost, generateImage, registerImageProvider } from '../../../src/index.js';

import type { ImageGenerationContext, ImageModel } from '../../../src/types/index.js';

describe('image public api', () => {
  it('exports calculateImageCost so callers can derive image spend from model pricing', () => {
    const cost = calculateImageCost(
      {
        id: 'test-image-model',
        name: 'Test Image Model',
        api: 'openai',
        baseUrl: 'https://api.example.com',
        input: ['text', 'image'],
        output: ['image'],
        cost: {
          inputText: 5,
          inputImage: 8,
          outputText: 10,
          outputImage: 32,
          reasoning: 10,
        },
      },
      {
        input: 100,
        inputText: 60,
        inputImage: 40,
        output: 120,
        outputText: 0,
        outputImage: 120,
        reasoning: 0,
        totalTokens: 220,
      }
    );

    expect(cost.inputText).toBeCloseTo(0.0003);
    expect(cost.inputImage).toBeCloseTo(0.00032);
    expect(cost.outputText).toBe(0);
    expect(cost.outputImage).toBeCloseTo(0.00384);
    expect(cost.reasoning).toBe(0);
    expect(cost.total).toBeCloseTo(0.00446);
  });

  it('exports registerImageProvider so callers can extend the image registry', async () => {
    const customGenerate = vi.fn(async () => ({
      id: 'custom-image-request',
      api: 'custom-image-provider',
      model: {
        id: 'custom-image-model',
        name: 'Custom Image Model',
        api: 'custom-image-provider',
        baseUrl: 'https://images.example.com',
        input: ['text'],
        output: ['image'],
        cost: {
          inputText: 0,
          inputImage: 0,
          outputText: 0,
          outputImage: 0,
          reasoning: 0,
        },
      },
      response: { ok: true },
      content: [],
      images: [],
      usage: {
        input: 0,
        inputText: 0,
        inputImage: 0,
        output: 0,
        outputText: 0,
        outputImage: 0,
        reasoning: 0,
        totalTokens: 0,
        cost: {
          inputText: 0,
          inputImage: 0,
          outputText: 0,
          outputImage: 0,
          reasoning: 0,
          total: 0,
        },
      },
      timestamp: Date.now(),
      duration: 0,
    }));

    registerImageProvider('custom-image-provider', {
      generate: customGenerate as any,
    });

    const model = {
      id: 'custom-image-model',
      name: 'Custom Image Model',
      api: 'custom-image-provider',
      baseUrl: 'https://images.example.com',
      input: ['text'],
      output: ['image'],
      cost: {
        inputText: 0,
        inputImage: 0,
        outputText: 0,
        outputImage: 0,
        reasoning: 0,
      },
    } as ImageModel<any>;

    const context: ImageGenerationContext = {
      prompt: 'Draw a small robot watering a plant',
    };

    await generateImage(model, context, { apiKey: 'test-key' } as any, 'custom-image-request');

    expect(customGenerate).toHaveBeenCalledWith(
      model,
      context,
      { apiKey: 'test-key' },
      'custom-image-request'
    );
  });
});
