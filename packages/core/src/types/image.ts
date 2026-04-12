import type { Api } from './api.js';
import type { Content, ImageContent } from './content.js';
import type { ImageNativeResponseForApi, ImageOptionsForApi } from './image-providers/index.js';

export const KnownImageApis = ['openai', 'google'] as const;

export type ImageApi = (typeof KnownImageApis)[number];

export function isValidImageApi(value: string): value is ImageApi {
  return KnownImageApis.includes(value as ImageApi);
}

export interface ImageModel<TApi extends ImageApi> {
  id: string;
  name: string;
  api: TApi;
  baseUrl: string;
  input: ('text' | 'image')[];
  output: ('text' | 'image')[];
  cost: {
    inputText: number;
    inputImage: number;
    outputText: number;
    outputImage: number;
    reasoning: number;
  };
  headers?: Record<string, string>;
}

export interface ImageProvider<TApi extends ImageApi> {
  model: ImageModel<TApi>;
  providerOptions?: ImageOptionsForApi<TApi>;
}

export interface ImageGenerationContext {
  prompt: string;
  images?: ImageContent[];
  mask?: ImageContent;
}

export interface ImageUsage {
  input: number;
  inputText: number;
  inputImage: number;
  output: number;
  outputText: number;
  outputImage: number;
  reasoning: number;
  totalTokens: number;
  cost: {
    inputText: number;
    inputImage: number;
    outputText: number;
    outputImage: number;
    reasoning: number;
    total: number;
  };
}

export interface BaseImageResult<TApi extends ImageApi> {
  id: string;
  api: TApi;
  model: ImageModel<TApi>;
  response: ImageNativeResponseForApi<TApi>;
  content: Content;
  images: ImageContent[];
  usage: ImageUsage;
  timestamp: number;
  duration: number;
}

export type AnyImageResult = BaseImageResult<ImageApi>;

export type SharedApi = Extract<Api, ImageApi>;
