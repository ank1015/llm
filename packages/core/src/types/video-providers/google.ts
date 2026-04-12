import type {
  GenerateVideosConfig,
  GenerateVideosOperation,
  GenerateVideosResponse,
} from '@google/genai';

export type GoogleVideoNativeResponse = GenerateVideosResponse;
export type GoogleVideoNativeOperation = GenerateVideosOperation;

interface GoogleVideoProps {
  apiKey: string;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export type GoogleVideoProviderOptions = Omit<GenerateVideosConfig, 'abortSignal'> &
  GoogleVideoProps;
