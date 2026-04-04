import type { MusicApi } from '../music.js';
import type { GoogleMusicNativeResponse, GoogleMusicProviderOptions } from './google.js';

export type { GoogleMusicNativeResponse, GoogleMusicProviderOptions } from './google.js';

export interface MusicApiNativeResponseMap {
  google: GoogleMusicNativeResponse;
}

export type MusicNativeResponseForApi<TApi extends MusicApi> = MusicApiNativeResponseMap[TApi];

export interface MusicApiOptionsMap {
  google: GoogleMusicProviderOptions;
}

export type MusicOptionsForApi<TApi extends MusicApi> = MusicApiOptionsMap[TApi];
