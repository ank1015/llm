import {
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  MediaModality,
  type ModalityTokenCount,
  type Part,
} from '@google/genai';

import { sanitizeSurrogates } from '../../../utils/sanitize-unicode.js';
import { calculateImageCost } from '../../models/index.js';

import type {
  BaseImageResult,
  Content,
  GoogleImageProviderOptions,
  ImageContent,
  ImageGenerationContext,
  ImageUsage,
  ImageModel,
  TextContent,
} from '../../../types/index.js';

export function createGoogleImageClient(model: ImageModel<'google'>, apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('Google API key is required.');
  }

  if (model.headers) {
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: model.headers },
    });
  }

  return new GoogleGenAI({ apiKey });
}

export function buildGoogleImageParams(
  model: ImageModel<'google'>,
  context: ImageGenerationContext,
  options: GoogleImageProviderOptions
): GenerateContentParameters {
  if (context.mask) {
    throw new Error('Google image generation does not support masks in this runtime yet.');
  }

  const { apiKey, signal, responseModalities, ...nativeOptions } = options;
  void apiKey;

  const config = {
    ...nativeOptions,
    responseModalities: normalizeGoogleResponseModalities(responseModalities),
    ...(signal ? { abortSignal: signal } : {}),
  };

  const contents: Part[] = [
    { text: sanitizeSurrogates(context.prompt) },
    ...((context.images || []).map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    })) as Part[]),
  ];

  return {
    model: model.id,
    contents,
    config,
  };
}

export function normalizeGoogleImageResponse(
  response: GenerateContentResponse
): Pick<BaseImageResult<'google'>, 'content' | 'images' | 'usage'> {
  const content: Content = [];
  const images: ImageContent[] = [];

  for (const [candidateIndex, candidate] of (response.candidates || []).entries()) {
    for (const part of candidate.content?.parts || []) {
      if (part.text) {
        const textContent: TextContent = {
          type: 'text',
          content: part.text,
          metadata: {
            candidateIndex,
          },
        };
        content.push(textContent);
      }

      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
        const imageContent: ImageContent = {
          type: 'image',
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
          metadata: {
            candidateIndex,
            generationProvider: 'google',
            generationStage: 'final',
          },
        };

        images.push(imageContent);
        content.push(imageContent);
      }
    }
  }

  const usage = normalizeGoogleImageUsage(response);
  return { content, images, usage };
}

export async function generateGoogleImage(
  model: ImageModel<'google'>,
  context: ImageGenerationContext,
  options: GoogleImageProviderOptions,
  id: string
): Promise<BaseImageResult<'google'>> {
  const startTimestamp = Date.now();
  const client = createGoogleImageClient(model, options.apiKey);
  const response = await client.models.generateContent(
    buildGoogleImageParams(model, context, options)
  );
  const normalized = normalizeGoogleImageResponse(response);
  normalized.usage.cost = calculateImageCost(model, normalized.usage);

  return {
    id,
    api: 'google',
    model,
    response,
    content: normalized.content,
    images: normalized.images,
    usage: normalized.usage,
    timestamp: Date.now(),
    duration: Date.now() - startTimestamp,
  };
}

function normalizeGoogleImageUsage(response: GenerateContentResponse): ImageUsage {
  const usageMetadata = response.usageMetadata;

  return {
    input: (usageMetadata?.promptTokenCount || 0) - (usageMetadata?.cachedContentTokenCount || 0),
    inputText: getGoogleModalityTokenCount(usageMetadata?.promptTokensDetails, MediaModality.TEXT),
    inputImage: getGoogleModalityTokenCount(
      usageMetadata?.promptTokensDetails,
      MediaModality.IMAGE
    ),
    output: (usageMetadata?.candidatesTokenCount || 0) + (usageMetadata?.thoughtsTokenCount || 0),
    outputText: getGoogleModalityTokenCount(
      usageMetadata?.candidatesTokensDetails,
      MediaModality.TEXT
    ),
    outputImage: getGoogleModalityTokenCount(
      usageMetadata?.candidatesTokensDetails,
      MediaModality.IMAGE
    ),
    reasoning: usageMetadata?.thoughtsTokenCount || 0,
    totalTokens: usageMetadata?.totalTokenCount || 0,
    cost: {
      inputText: 0,
      inputImage: 0,
      outputText: 0,
      outputImage: 0,
      reasoning: 0,
      total: 0,
    },
  };
}

function getGoogleModalityTokenCount(
  details: ModalityTokenCount[] | undefined,
  modality: MediaModality
): number {
  return details?.find((detail) => detail.modality === modality)?.tokenCount || 0;
}

function normalizeGoogleResponseModalities(responseModalities: string[] | undefined): string[] {
  if (!responseModalities || responseModalities.length === 0) {
    return ['TEXT', 'IMAGE'];
  }

  if (responseModalities.includes('IMAGE')) {
    return responseModalities;
  }

  return [...responseModalities, 'IMAGE'];
}
