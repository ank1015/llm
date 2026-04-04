import {
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  MediaModality,
  type ModalityTokenCount,
  type Part,
} from '@google/genai';

import { sanitizeSurrogates } from '../../../utils/sanitize-unicode.js';
import { calculateMusicCost } from '../../models/index.js';

import type {
  AudioContent,
  BaseMusicResult,
  GoogleMusicProviderOptions,
  ImageContent,
  MusicContent,
  MusicGenerationContext,
  MusicModel,
  MusicResponseMimeType,
  MusicUsage,
  TextContent,
} from '../../../types/index.js';

export function createGoogleMusicClient(model: MusicModel<'google'>, apiKey: string): GoogleGenAI {
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

export function buildGoogleMusicParams(
  model: MusicModel<'google'>,
  context: MusicGenerationContext,
  options: GoogleMusicProviderOptions
): GenerateContentParameters {
  validateGoogleMusicRequest(model, context, options);

  const { apiKey, signal, responseModalities, ...nativeOptions } = options;
  void apiKey;

  const config = {
    ...nativeOptions,
    responseModalities: normalizeGoogleMusicResponseModalities(responseModalities),
    ...(signal ? { abortSignal: signal } : {}),
  };

  const contents: Part[] = [
    {
      text: sanitizeSurrogates(context.prompt),
    },
    ...((context.images || []).map((image) => toGoogleMusicImagePart(image)) as Part[]),
  ];

  return {
    model: model.id,
    contents,
    config,
  };
}

export function normalizeGoogleMusicResponse(
  model: MusicModel<'google'>,
  response: GenerateContentResponse,
  options: Pick<GoogleMusicProviderOptions, 'responseMimeType'>
): Pick<BaseMusicResult<'google'>, 'content' | 'tracks' | 'usage'> {
  const content: MusicContent = [];
  const tracks: AudioContent[] = [];

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

      if (part.inlineData?.data) {
        const mimeType = normalizeGoogleMusicMimeType(
          model,
          part.inlineData.mimeType ?? options.responseMimeType
        );

        if (!mimeType.startsWith('audio/')) {
          continue;
        }

        const trackContent: AudioContent = {
          type: 'audio',
          data: part.inlineData.data,
          mimeType,
          metadata: {
            candidateIndex,
            generationProvider: 'google',
            generationStage: 'final',
            trackIndex: tracks.length,
          },
        };

        tracks.push(trackContent);
        content.push(trackContent);
      }
    }
  }

  const usage = normalizeGoogleMusicUsage(response);
  return { content, tracks, usage };
}

export async function generateGoogleMusic(
  model: MusicModel<'google'>,
  context: MusicGenerationContext,
  options: GoogleMusicProviderOptions,
  id: string
): Promise<BaseMusicResult<'google'>> {
  const startTimestamp = Date.now();
  const client = createGoogleMusicClient(model, options.apiKey);
  const response = await client.models.generateContent(
    buildGoogleMusicParams(model, context, options)
  );
  const normalized = normalizeGoogleMusicResponse(model, response, options);
  normalized.usage.cost = calculateMusicCost(model, normalized.usage.requests);

  if (normalized.tracks.length === 0) {
    throw new Error('Google music generation did not return any audio tracks.');
  }

  return {
    id,
    api: 'google',
    model,
    response,
    content: normalized.content,
    tracks: normalized.tracks,
    usage: normalized.usage,
    timestamp: Date.now(),
    duration: Date.now() - startTimestamp,
  };
}

function validateGoogleMusicRequest(
  model: MusicModel<'google'>,
  context: MusicGenerationContext,
  options: GoogleMusicProviderOptions
): void {
  if (!context.prompt || context.prompt.trim().length === 0) {
    throw new Error('Google music generation requires a prompt.');
  }

  if ((context.images?.length || 0) > model.capabilities.maxImages) {
    throw new Error(
      `Model ${model.id} supports up to ${model.capabilities.maxImages} input images.`
    );
  }

  if (
    options.responseMimeType &&
    !model.capabilities.supportedMimeTypes.includes(
      options.responseMimeType as MusicResponseMimeType
    )
  ) {
    throw new Error(
      `Model ${model.id} does not support responseMimeType=${options.responseMimeType}.`
    );
  }
}

function normalizeGoogleMusicUsage(response: GenerateContentResponse): MusicUsage {
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
    outputAudio: getGoogleModalityTokenCount(
      usageMetadata?.candidatesTokensDetails,
      MediaModality.AUDIO
    ),
    reasoning: usageMetadata?.thoughtsTokenCount || 0,
    requests: 1,
    totalTokens: usageMetadata?.totalTokenCount || 0,
    cost: {
      request: 0,
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

function normalizeGoogleMusicResponseModalities(
  responseModalities: string[] | undefined
): string[] {
  if (!responseModalities || responseModalities.length === 0) {
    return ['AUDIO', 'TEXT'];
  }

  if (responseModalities.includes('AUDIO')) {
    return responseModalities;
  }

  return [...responseModalities, 'AUDIO'];
}

function normalizeGoogleMusicMimeType(
  model: MusicModel<'google'>,
  mimeType: string | undefined
): MusicResponseMimeType {
  const normalizedMimeType =
    mimeType && model.capabilities.supportedMimeTypes.includes(mimeType as MusicResponseMimeType)
      ? (mimeType as MusicResponseMimeType)
      : model.capabilities.defaultMimeType;

  return normalizedMimeType;
}

function toGoogleMusicImagePart(image: ImageContent): Part {
  return {
    inlineData: {
      mimeType: image.mimeType,
      data: image.data,
    },
  };
}
