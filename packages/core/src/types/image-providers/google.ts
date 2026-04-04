import type { GenerateContentConfig, GenerateContentResponse } from '@google/genai';

export type GoogleImageNativeResponse = GenerateContentResponse;

interface GoogleImageProps {
  apiKey: string;
  signal?: AbortSignal;
}

export type GoogleImageProviderOptions = Omit<GenerateContentConfig, 'abortSignal'> &
  GoogleImageProps;
