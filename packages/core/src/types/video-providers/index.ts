import type {
  GoogleVideoNativeOperation,
  GoogleVideoNativeResponse,
  GoogleVideoProviderOptions,
} from './google.js';
import type { VideoApi } from '../video.js';

export type {
  GoogleVideoNativeOperation,
  GoogleVideoNativeResponse,
  GoogleVideoProviderOptions,
} from './google.js';

export interface VideoApiNativeResponseMap {
  google: GoogleVideoNativeResponse;
}

export interface VideoApiNativeOperationMap {
  google: GoogleVideoNativeOperation;
}

export type VideoNativeResponseForApi<TApi extends VideoApi> = VideoApiNativeResponseMap[TApi];
export type VideoNativeOperationForApi<TApi extends VideoApi> = VideoApiNativeOperationMap[TApi];

export interface VideoApiOptionsMap {
  google: GoogleVideoProviderOptions;
}

export type VideoOptionsForApi<TApi extends VideoApi> = VideoApiOptionsMap[TApi];
