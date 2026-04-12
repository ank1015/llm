import type { GoogleImageNativeResponse, GoogleImageProviderOptions } from './google.js';
import type { OpenAIImageNativeResponse, OpenAIImageProviderOptions } from './openai.js';
import type { ImageApi } from '../image.js';

export type { GoogleImageNativeResponse, GoogleImageProviderOptions } from './google.js';
export type { OpenAIImageNativeResponse, OpenAIImageProviderOptions } from './openai.js';

export interface ImageApiNativeResponseMap {
  openai: OpenAIImageNativeResponse;
  google: GoogleImageNativeResponse;
}

export type ImageNativeResponseForApi<TApi extends ImageApi> = ImageApiNativeResponseMap[TApi];

export interface ImageApiOptionsMap {
  openai: OpenAIImageProviderOptions;
  google: GoogleImageProviderOptions;
}

export type ImageOptionsForApi<TApi extends ImageApi> = ImageApiOptionsMap[TApi];
