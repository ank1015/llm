import type { MusicModel } from '../../types/index.js';

const googleBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
const mp3MimeType = 'audio/mpeg';

export const googleMusicModels = {
  'lyria-3-clip-preview': {
    id: 'lyria-3-clip-preview',
    name: 'Lyria 3 Clip Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image'],
    output: ['text', 'audio'],
    cost: {
      request: 0.04,
    },
    capabilities: {
      maxImages: 10,
      fixedDurationSeconds: 30,
      supportsPromptControlledDuration: false,
      defaultMimeType: mp3MimeType,
      supportedMimeTypes: [mp3MimeType],
    },
  } satisfies MusicModel<'google'>,
  'lyria-3-pro-preview': {
    id: 'lyria-3-pro-preview',
    name: 'Lyria 3 Pro Preview',
    api: 'google',
    baseUrl: googleBaseUrl,
    input: ['text', 'image'],
    output: ['text', 'audio'],
    cost: {
      request: 0.08,
    },
    capabilities: {
      maxImages: 10,
      supportsPromptControlledDuration: true,
      defaultMimeType: mp3MimeType,
      supportedMimeTypes: [mp3MimeType, 'audio/wav'],
    },
  } satisfies MusicModel<'google'>,
};
