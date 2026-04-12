import type { VideoModel } from '../../types/index.js';

const googleBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
const googleVideoAspectRatios: VideoModel<'google'>['capabilities']['supportedAspectRatios'] = [
  '16:9',
  '9:16',
];
const googleVideoDurations: VideoModel<'google'>['capabilities']['supportedDurations'] = [4, 6, 8];

const standardAndFastCapabilities: VideoModel<'google'>['capabilities'] = {
  interpolation: true,
  referenceImages: true,
  videoExtension: true,
  maxReferenceImages: 3,
  maxVideosPerRequest: 1,
  supportedAspectRatios: [...googleVideoAspectRatios],
  supportedDurations: [...googleVideoDurations],
  supportedResolutions: ['720p', '1080p', '4k'],
};

const liteCapabilities: VideoModel<'google'>['capabilities'] = {
  interpolation: true,
  referenceImages: false,
  videoExtension: false,
  maxReferenceImages: 0,
  maxVideosPerRequest: 1,
  supportedAspectRatios: [...googleVideoAspectRatios],
  supportedDurations: [...googleVideoDurations],
  supportedResolutions: ['720p', '1080p'],
};

export const googleVideoModels = {
  'veo-3.1-generate-preview': {
    id: 'veo-3.1-generate-preview',
    name: 'Veo 3.1 Generate Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image', 'video'],
    output: ['video', 'audio'],
    cost: {
      '720p': 0.4,
      '1080p': 0.4,
      '4k': 0.6,
    },
    capabilities: standardAndFastCapabilities,
  } satisfies VideoModel<'google'>,
  'veo-3.1-fast-generate-preview': {
    id: 'veo-3.1-fast-generate-preview',
    name: 'Veo 3.1 Fast Generate Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image', 'video'],
    output: ['video', 'audio'],
    cost: {
      '720p': 0.15,
      '1080p': 0.15,
      '4k': 0.35,
    },
    capabilities: standardAndFastCapabilities,
  } satisfies VideoModel<'google'>,
  'veo-3.1-lite-generate-preview': {
    id: 'veo-3.1-lite-generate-preview',
    name: 'Veo 3.1 Lite Generate Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image'],
    output: ['video', 'audio'],
    cost: {
      '720p': 0.05,
      '1080p': 0.08,
    },
    capabilities: liteCapabilities,
  } satisfies VideoModel<'google'>,
};
