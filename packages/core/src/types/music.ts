import type { Api } from './api.js';
import type { ImageContent, TextContent } from './content.js';
import type { MusicNativeResponseForApi, MusicOptionsForApi } from './music-providers/index.js';

export const KnownMusicApis = ['google'] as const;
export const KnownMusicResponseMimeTypes = ['audio/mpeg', 'audio/wav'] as const;

export type MusicApi = (typeof KnownMusicApis)[number];
export type MusicResponseMimeType = (typeof KnownMusicResponseMimeTypes)[number];

export function isValidMusicApi(value: string): value is MusicApi {
  return KnownMusicApis.includes(value as MusicApi);
}

export interface AudioContent {
  type: 'audio';
  data: string;
  mimeType: string;
  metadata?: Record<string, unknown>;
}

export type MusicContent = (TextContent | AudioContent)[];

export interface MusicModelCapabilities {
  maxImages: number;
  fixedDurationSeconds?: number;
  supportsPromptControlledDuration: boolean;
  defaultMimeType: MusicResponseMimeType;
  supportedMimeTypes: MusicResponseMimeType[];
}

export interface MusicModel<TApi extends MusicApi> {
  id: string;
  name: string;
  api: TApi;
  baseUrl: string;
  input: ('text' | 'image')[];
  output: ('text' | 'audio')[];
  cost: {
    request: number;
  };
  capabilities: MusicModelCapabilities;
  headers?: Record<string, string>;
}

export interface MusicProvider<TApi extends MusicApi> {
  model: MusicModel<TApi>;
  providerOptions?: MusicOptionsForApi<TApi>;
}

export interface MusicGenerationContext {
  prompt: string;
  images?: ImageContent[];
}

export interface MusicUsage {
  input: number;
  inputText: number;
  inputImage: number;
  output: number;
  outputText: number;
  outputAudio: number;
  reasoning: number;
  requests: number;
  totalTokens: number;
  cost: {
    request: number;
    total: number;
  };
}

export interface BaseMusicResult<TApi extends MusicApi> {
  id: string;
  api: TApi;
  model: MusicModel<TApi>;
  response: MusicNativeResponseForApi<TApi>;
  content: MusicContent;
  tracks: AudioContent[];
  usage: MusicUsage;
  timestamp: number;
  duration: number;
}

export type AnyMusicResult = BaseMusicResult<MusicApi>;

export type SharedMusicApi = Extract<Api, MusicApi>;
