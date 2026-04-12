import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  calculateMusicCost,
  generateImage,
  generateMusic,
  getImageModel,
  getMusicModel,
} from '../../../src/index.js';
import { describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type { BaseMusicResult, ImageContent, ImageModel, MusicModel } from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('GEMINI_API_KEY')!;
const describeIfGoogle = describeIfAvailable(Boolean(apiKey));
const artifactsDir = resolve(process.cwd(), 'tests/integration/.artifacts/google-music');

describeIfGoogle('Google Music Integration', () => {
  let clipModel: MusicModel<'google'>;
  let imageModel: ImageModel<'google'>;
  let proModel: MusicModel<'google'>;
  let referenceImage: ImageContent;

  beforeAll(async () => {
    mkdirSync(artifactsDir, { recursive: true });

    const resolvedImageModel = getImageModel('google', 'gemini-3.1-flash-image-preview');
    const resolvedClipModel = getMusicModel('google', 'lyria-3-clip-preview');
    const resolvedProModel = getMusicModel('google', 'lyria-3-pro-preview');

    if (!resolvedImageModel) {
      throw new Error('Test model gemini-3.1-flash-image-preview not found');
    }

    if (!resolvedClipModel) {
      throw new Error('Test model lyria-3-clip-preview not found');
    }

    if (!resolvedProModel) {
      throw new Error('Test model lyria-3-pro-preview not found');
    }

    imageModel = resolvedImageModel;
    clipModel = resolvedClipModel;
    proModel = resolvedProModel;
    referenceImage = await generateReferenceImage(imageModel);
  }, 300000);

  it('should generate a playable clip track and save it locally', async () => {
    const result = await generateMusic(
      clipModel,
      {
        prompt:
          'A bright 30-second chiptune victory theme in C major, retro 8-bit arcade style, bubbly lead melody, punchy bass, instrumental only, no vocals.',
      },
      {
        apiKey,
        responseModalities: ['AUDIO', 'TEXT'],
      },
      'google-music-clip-1'
    );

    const { audioPath } = writeMusicArtifacts(result, 'lyria-clip-chiptune');

    expect(result.id).toBe('google-music-clip-1');
    expectMusicResult(result, clipModel, 'audio/mpeg');
    expect(audioPath.endsWith('.mp3')).toBe(true);
  }, 300000);

  it('should generate a pro song with structured lyrics and save it locally', async () => {
    const result = await generateMusic(
      proModel,
      {
        prompt: `Create a dreamy indie pop song in WAV format with these lyrics:

[Verse]
City lights shimmer on the rain-soaked street,
footsteps echo softly under neon heat.

[Chorus]
We run through the midnight glow,
holding on and letting go.`,
      },
      {
        apiKey,
        responseModalities: ['AUDIO', 'TEXT'],
      },
      'google-music-pro-lyrics-1'
    );

    const { audioPath, textPath } = writeMusicArtifacts(result, 'lyria-pro-neon-indie-pop');

    expect(result.id).toBe('google-music-pro-lyrics-1');
    expectMusicResult(result, proModel, 'audio/mpeg');
    expect(getMusicText(result).length).toBeGreaterThan(0);
    expect(textPath).toBeDefined();
    expect(audioPath.endsWith('.mp3')).toBe(true);
  }, 300000);

  it('should generate image-guided music and save it locally', async () => {
    const result = await generateMusic(
      proModel,
      {
        prompt:
          'Compose an atmospheric ambient track inspired by the mood and colors of this image, slow tempo, soft piano, glowing synth pads, no percussion-heavy sections.',
        images: [
          referenceImage,
        ],
      },
      {
        apiKey,
        responseModalities: ['AUDIO', 'TEXT'],
      },
      'google-music-pro-image-1'
    );

    const { audioPath } = writeMusicArtifacts(result, 'lyria-pro-image-ambient');

    expect(result.id).toBe('google-music-pro-image-1');
    expectMusicResult(result, proModel, 'audio/mpeg');
    expect(result.usage.inputImage).toBeGreaterThan(0);
    expect(audioPath.endsWith('.mp3')).toBe(true);
  }, 300000);
});

function expectMusicResult(
  result: BaseMusicResult<'google'>,
  model: MusicModel<'google'>,
  expectedMimeType: 'audio/mpeg' | 'audio/wav'
): void {
  expect(result.api).toBe('google');
  expect(result.model).toBe(model);
  expect(result.tracks.length).toBeGreaterThan(0);
  expect(result.duration).toBeGreaterThanOrEqual(0);

  const track = result.tracks[0];
  expect(track).toBeDefined();
  expect(track?.mimeType).toBe(expectedMimeType);
  expect(Buffer.from(track?.data || '', 'base64').byteLength).toBeGreaterThan(0);
  expect(track?.metadata?.generationProvider).toBe('google');
  expect(track?.metadata?.generationStage).toBe('final');

  expect(result.usage.input).toBeGreaterThan(0);
  expect(result.usage.output).toBeGreaterThan(0);
  expect(result.usage.outputAudio).toBeGreaterThanOrEqual(0);
  expect(result.usage.requests).toBe(1);
  expect(result.usage.totalTokens).toBeGreaterThan(0);
  expect(result.usage.cost).toEqual(calculateMusicCost(model, result.usage.requests));
  expect(result.usage.cost.total).toBeGreaterThan(0);
}

function getMusicText(result: BaseMusicResult<'google'>): string {
  return result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.content)
    .join('\n')
    .trim();
}

function writeMusicArtifacts(
  result: BaseMusicResult<'google'>,
  baseName: string
): { audioPath: string; textPath?: string } {
  const track = result.tracks[0];
  if (!track) {
    throw new Error('Expected a generated music track.');
  }

  const extension = track.mimeType === 'audio/wav' ? 'wav' : 'mp3';
  const audioPath = resolve(artifactsDir, `${baseName}.${extension}`);
  writeFileSync(audioPath, Buffer.from(track.data, 'base64'));

  const text = getMusicText(result);
  if (!text) {
    return { audioPath };
  }

  const textPath = resolve(artifactsDir, `${baseName}.txt`);
  writeFileSync(textPath, `${text}\n`);

  return { audioPath, textPath };
}

async function generateReferenceImage(model: ImageModel<'google'>): Promise<ImageContent> {
  const result = await generateImage(
    model,
    {
      prompt:
        'Create a cinematic, colorful desert sunset illustration with long shadows, glowing orange and magenta skies, and a solitary road leading toward distant mountains. No text.',
    },
    {
      apiKey,
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: '16:9',
        imageSize: '1K',
      },
    },
    'google-music-reference-image-1'
  );

  const image = result.images[0];
  if (!image) {
    throw new Error('Expected a generated reference image for music integration.');
  }

  return image;
}
