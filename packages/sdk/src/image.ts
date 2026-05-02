import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse } from 'node:path';

import { runGatewayImageRequest } from './gateway.js';

import type {
  AzureOpenAIImageProviderOptions,
  AnyImageResult,
  BaseImageResult,
  ImageContent,
  ImageUsage,
} from '@ank1015/llm-core';

const SDK_IMAGE_API = 'azure-openai' as const;
const SDK_IMAGE_MODEL_ID = 'gpt-image-2' as const;
type AzureOpenAIImageNativeSize = NonNullable<AzureOpenAIImageProviderOptions['size']>;

export type ImageSize = 'auto' | `${number}x${number}`;
export type ImageQuality = 'auto' | 'low' | 'medium' | 'high';
export type ImageFormat = 'png' | 'jpeg' | 'webp';
export type ImageBackground = 'auto' | 'opaque';
export type ImageModeration = 'auto' | 'low';

export interface ImageInput {
  prompt: string;
  output: string;
  inputImages?: string[];
  mask?: string;
  count?: number;
  size?: ImageSize;
  quality?: ImageQuality;
  format?: ImageFormat;
  compression?: number;
  background?: ImageBackground;
  moderation?: ImageModeration;
  requestId?: string;
  signal?: AbortSignal;
}

export interface ImageResult {
  path?: string;
  paths: string[];
  text: string;
  usage: ImageUsage;
  raw: AnyImageResult;
}

export class ImageInputError extends Error {
  readonly code: 'invalid_image_input';

  constructor(message: string) {
    super(message);
    this.name = 'ImageInputError';
    this.code = 'invalid_image_input';
  }
}

export async function image(input: ImageInput): Promise<ImageResult> {
  validateImageInput(input);

  const context = await buildImageContext(input);
  const providerOptions = buildAzureOpenAIImageProviderOptions(input);

  const result = await runGatewayImageRequest<typeof SDK_IMAGE_API>({
    api: SDK_IMAGE_API,
    modelId: SDK_IMAGE_MODEL_ID,
    context,
    providerOptions: providerOptions as Record<string, unknown>,
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  });

  if (result.images.length === 0) {
    throw new Error(buildNoImagesGeneratedMessage(result));
  }

  const paths = await saveGeneratedImages(result.images, input.output);

  return {
    ...(paths.length === 1 ? { path: paths[0] } : {}),
    paths,
    text: getImageResultText(result),
    usage: result.usage,
    raw: result,
  };
}

async function buildImageContext(input: ImageInput): Promise<{
  prompt: string;
  images?: ImageContent[];
  mask?: ImageContent;
}> {
  const images = input.inputImages
    ? await Promise.all(input.inputImages.map(readImageFromPath))
    : [];

  if (input.mask) {
    if (images.length === 0) {
      throw new ImageInputError('Mask editing requires at least one inputImages entry.');
    }

    return {
      prompt: input.prompt,
      images,
      mask: await readImageFromPath(input.mask),
    };
  }

  return {
    prompt: input.prompt,
    ...(images.length > 0 ? { images } : {}),
  };
}

function buildAzureOpenAIImageProviderOptions(
  input: ImageInput
): Partial<AzureOpenAIImageProviderOptions> {
  const providerOptions: Partial<AzureOpenAIImageProviderOptions> = {};

  if (input.size !== undefined) {
    providerOptions.size = input.size as AzureOpenAIImageNativeSize;
  }
  if (input.quality !== undefined) providerOptions.quality = input.quality;
  if (input.background !== undefined) providerOptions.background = input.background;
  if (input.format !== undefined) providerOptions.output_format = input.format;
  if (input.compression !== undefined) providerOptions.output_compression = input.compression;
  if (input.moderation !== undefined) providerOptions.moderation = input.moderation;
  if (input.count !== undefined) providerOptions.n = input.count;

  return providerOptions;
}

function validateImageInput(input: ImageInput): void {
  if (input.mask && (!input.inputImages || input.inputImages.length === 0)) {
    throw new ImageInputError('Mask editing requires at least one inputImages entry.');
  }

  if (input.count !== undefined && (!Number.isInteger(input.count) || input.count < 1)) {
    throw new ImageInputError('count must be a positive integer.');
  }

  if (
    input.compression !== undefined &&
    (!Number.isInteger(input.compression) || input.compression < 0 || input.compression > 100)
  ) {
    throw new ImageInputError('compression must be an integer from 0 to 100.');
  }

  if (input.compression !== undefined && input.format !== 'jpeg' && input.format !== 'webp') {
    throw new ImageInputError('compression can only be used with format: "jpeg" or "webp".');
  }
}

async function readImageFromPath(filePath: string): Promise<ImageContent> {
  const mimeType = getMimeTypeForPath(filePath);
  const data = await readFile(filePath);

  return {
    type: 'image',
    data: data.toString('base64'),
    mimeType,
    metadata: {
      fileName: basename(filePath),
      path: filePath,
    },
  };
}

async function saveGeneratedImages(images: ImageContent[], output: string): Promise<string[]> {
  const paths = buildOutputPaths(images, output);

  await Promise.all(
    images.map(async (generatedImage, index) => {
      const filePath = paths[index]!;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, Buffer.from(generatedImage.data, 'base64'));
    })
  );

  return paths;
}

function buildOutputPaths(images: ImageContent[], output: string): string[] {
  const parsed = parse(output);
  const hasBaseName = parsed.base.length > 0 || parsed.name.length > 0;

  if (!hasBaseName) {
    throw new ImageInputError(`Output path "${output}" must include a file name.`);
  }

  const baseName = parsed.name || parsed.base;

  return images.map((generatedImage, index) => {
    const extension = `.${getFileExtensionForMimeType(generatedImage.mimeType)}`;
    const fileName =
      images.length === 1 ? `${baseName}${extension}` : `${baseName}-${index + 1}${extension}`;
    return parsed.dir ? join(parsed.dir, fileName) : fileName;
  });
}

function getImageResultText(result: BaseImageResult<typeof SDK_IMAGE_API>): string {
  let text = '';

  for (const content of result.content) {
    if (content.type === 'text') {
      text += content.content;
    }
  }

  return text;
}

function buildNoImagesGeneratedMessage(result: BaseImageResult<typeof SDK_IMAGE_API>): string {
  const text = getImageResultText(result).trim();
  return text.length > 0
    ? `No images were generated. Provider text: ${text}`
    : 'No images were generated.';
}

function getMimeTypeForPath(filePath: string): string {
  switch (parse(filePath).ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    default:
      throw new ImageInputError(
        `Unsupported image file extension for "${filePath}". Supported extensions: .png, .jpg, .jpeg, .webp, .gif, .heic, .heif`
      );
  }
}

function getFileExtensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
    case 'image/png':
    default:
      return 'png';
  }
}
