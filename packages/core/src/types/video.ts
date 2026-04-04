import type { Api } from './api.js';
import type { ImageContent } from './content.js';
import type {
  VideoNativeOperationForApi,
  VideoNativeResponseForApi,
  VideoOptionsForApi,
} from './video-providers/index.js';

export const KnownVideoApis = ['google'] as const;
export const KnownVideoResolutions = ['720p', '1080p', '4k'] as const;
export const KnownVideoAspectRatios = ['16:9', '9:16'] as const;
export const KnownVideoDurationSeconds = [4, 6, 8] as const;

export type VideoApi = (typeof KnownVideoApis)[number];
export type VideoResolution = (typeof KnownVideoResolutions)[number];
export type VideoAspectRatio = (typeof KnownVideoAspectRatios)[number];
export type VideoDurationSeconds = (typeof KnownVideoDurationSeconds)[number];
export type VideoUsageSource = 'provider' | 'estimated' | 'unavailable';

export function isValidVideoApi(value: string): value is VideoApi {
  return KnownVideoApis.includes(value as VideoApi);
}

export interface VideoModelCapabilities {
  interpolation: boolean;
  referenceImages: boolean;
  videoExtension: boolean;
  maxReferenceImages: number;
  maxVideosPerRequest: number;
  supportedAspectRatios: VideoAspectRatio[];
  supportedDurations: VideoDurationSeconds[];
  supportedResolutions: VideoResolution[];
}

export interface VideoAsset {
  type: 'video';
  data?: string;
  mimeType?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface VideoReferenceImage {
  image: ImageContent;
  referenceType?: 'asset' | 'style';
}

export interface VideoModel<TApi extends VideoApi> {
  id: string;
  name: string;
  api: TApi;
  baseUrl: string;
  input: ('text' | 'image' | 'video')[];
  output: ('video' | 'audio')[];
  cost: Partial<Record<VideoResolution, number>>;
  capabilities: VideoModelCapabilities;
  headers?: Record<string, string>;
}

export interface VideoProvider<TApi extends VideoApi> {
  model: VideoModel<TApi>;
  providerOptions?: VideoOptionsForApi<TApi>;
}

export interface VideoGenerationContext {
  prompt?: string;
  image?: ImageContent;
  lastFrame?: ImageContent;
  referenceImages?: VideoReferenceImage[];
  video?: VideoAsset;
}

export interface VideoUsage {
  available: boolean;
  source: VideoUsageSource;
  reason?: string;
  durationSeconds?: number;
  billedSeconds?: number;
  numberOfVideos?: number;
  resolution?: VideoResolution;
  cost?: {
    resolution: VideoResolution;
    ratePerSecond: number;
    billedSeconds: number;
    total: number;
  };
}

export interface BaseVideoResult<TApi extends VideoApi> {
  id: string;
  api: TApi;
  model: VideoModel<TApi>;
  operation: VideoNativeOperationForApi<TApi>;
  response: VideoNativeResponseForApi<TApi>;
  videos: VideoAsset[];
  usage: VideoUsage;
  timestamp: number;
  duration: number;
}

export type AnyVideoResult = BaseVideoResult<VideoApi>;

export type SharedVideoApi = Extract<Api, VideoApi>;
