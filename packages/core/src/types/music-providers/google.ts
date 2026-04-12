import type { GenerateContentConfig, GenerateContentResponse } from '@google/genai';

export type GoogleMusicNativeResponse = GenerateContentResponse;

interface GoogleMusicProps {
  apiKey: string;
  signal?: AbortSignal;
}

export type GoogleMusicProviderOptions = Omit<GenerateContentConfig, 'abortSignal'> &
  GoogleMusicProps;
