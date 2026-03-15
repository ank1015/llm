import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, parse, resolve } from 'node:path';

import { buildUserMessage, getModel, stream as sdkStream } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import type {
  BaseAssistantEvent,
  BaseAssistantMessage,
  GoogleProviderOptions,
  ImageContent,
  OpenAIProviderOptions,
} from '@ank1015/llm-sdk';

const defaultKeysAdapter = createFileKeysAdapter();

export const IMAGE_MODEL_IDS = [
  'gpt-5.4',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
] as const;

export type ImageModelId = (typeof IMAGE_MODEL_IDS)[number];
export type ImageSource = string | readonly string[];

export const OPENAI_IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const;
export const GOOGLE_IMAGE_SIZES = ['1K', '2K', '4K'] as const;
export const GOOGLE_PRO_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;
export const GOOGLE_FLASH_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const;

export type OpenAIImageSize = (typeof OPENAI_IMAGE_SIZES)[number];
export type GoogleImageSize = (typeof GOOGLE_IMAGE_SIZES)[number];
export type GoogleProImageAspectRatio = (typeof GOOGLE_PRO_IMAGE_ASPECT_RATIOS)[number];
export type GoogleFlashImageAspectRatio = (typeof GOOGLE_FLASH_IMAGE_ASPECT_RATIOS)[number];

export interface OpenAIImageOptions {
  format?: 'png' | 'jpeg' | 'webp';
  quality?: 'low' | 'medium' | 'high' | 'auto';
  background?: 'transparent' | 'opaque' | 'auto';
  size?: OpenAIImageSize;
  partialImages?: 0 | 1 | 2 | 3;
  inputFidelity?: 'low' | 'high';
  moderation?: 'auto' | 'low';
}

export interface GoogleProImageOptions {
  aspectRatio?: GoogleProImageAspectRatio;
  imageSize?: GoogleImageSize;
}

export interface GoogleFlashImageOptions {
  aspectRatio?: GoogleFlashImageAspectRatio;
  imageSize?: GoogleImageSize;
}

export type GoogleImageOptions = GoogleFlashImageOptions | GoogleProImageOptions;
export type ImageOptions = OpenAIImageOptions | GoogleImageOptions;

export interface OpenAIImageProvider {
  model: 'gpt-5.4';
  apiKey?: string;
  imageOptions?: OpenAIImageOptions;
}

export interface GoogleFlashImageProvider {
  model: 'gemini-3.1-flash-image-preview';
  apiKey?: string;
  imageOptions?: GoogleFlashImageOptions;
}

export interface GoogleProImageProvider {
  model: 'gemini-3-pro-image-preview';
  apiKey?: string;
  imageOptions?: GoogleProImageOptions;
}

export type GoogleImageProvider = GoogleFlashImageProvider | GoogleProImageProvider;
export type ImageProvider = OpenAIImageProvider | GoogleImageProvider;

export interface ImageUpdate {
  stage: 'partial' | 'thought' | 'final';
  path: string;
  mimeType: string;
  index: number;
  model: ImageModelId;
}

interface BaseImageRequest {
  provider: ImageProvider;
  prompt: string;
  outputDir: string;
  outputName?: string;
  systemPrompt?: string;
  onUpdate?: (update: ImageUpdate) => void | Promise<void>;
}

export interface CreateImageRequest extends BaseImageRequest {
  images?: ImageSource;
}

export interface EditImageRequest extends BaseImageRequest {
  images: ImageSource;
}

export interface ImageResult {
  path: string;
}

type ImageMethod = 'create' | 'edit';
type ImageStage = ImageUpdate['stage'];

interface LoadedImageSource {
  fileName: string;
  mimeType: string;
  data: string;
  size: number;
}

const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function isImageModelId(value: string): value is ImageModelId {
  return IMAGE_MODEL_IDS.includes(value as ImageModelId);
}

function assertImageModelId(model: string): asserts model is ImageModelId {
  if (!isImageModelId(model)) {
    throw new Error(
      `Unsupported image model "${model}". Supported models: ${IMAGE_MODEL_IDS.join(', ')}.`
    );
  }
}

function assertImageProvider(provider: {
  model?: string;
  apiKey?: string;
  imageOptions?: unknown;
}): asserts provider is ImageProvider {
  if (typeof provider.model !== 'string') {
    throw new Error('provider.model is required.');
  }

  assertImageModelId(provider.model);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function inferMimeTypeFromExtension(pathLike: string): string | undefined {
  return EXTENSION_TO_MIME_TYPE[extname(pathLike).toLowerCase()];
}

function inferMimeTypeFromBuffer(buffer: Uint8Array): string | undefined {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }

  return undefined;
}

function inferMimeTypeFromContentType(contentType: string | null): string | undefined {
  if (!contentType) return undefined;
  const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
  if (!mimeType) return undefined;
  if (!mimeType.startsWith('image/')) return undefined;
  return MIME_TYPE_TO_EXTENSION[mimeType] ? mimeType : undefined;
}

function getExtensionForMimeType(mimeType: string): string {
  const extension = MIME_TYPE_TO_EXTENSION[mimeType];
  if (!extension) {
    throw new Error(`Unsupported image mime type "${mimeType}".`);
  }
  return extension;
}

function normalizeImageSources(images?: ImageSource): string[] {
  if (images === undefined) {
    return [];
  }

  return typeof images === 'string' ? [images] : [...images];
}

function sanitizeOutputStem(outputName?: string): string {
  if (!outputName) {
    return `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const trimmed = outputName.trim();
  if (!trimmed) {
    throw new Error('outputName must not be empty.');
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..') {
    throw new Error('outputName must be a filename stem, not a path.');
  }

  const stem = parse(trimmed).name.trim();
  if (!stem) {
    throw new Error('outputName must contain at least one non-extension character.');
  }

  return stem;
}

async function loadLocalImageSource(source: string): Promise<LoadedImageSource> {
  const buffer = await readFile(source);
  const mimeType = inferMimeTypeFromBuffer(buffer) ?? inferMimeTypeFromExtension(source);

  if (!mimeType) {
    throw new Error(`Could not determine image type for local source "${source}".`);
  }

  return {
    fileName: basename(source),
    mimeType,
    data: buffer.toString('base64'),
    size: buffer.length,
  };
}

async function loadRemoteImageSource(source: string, index: number): Promise<LoadedImageSource> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(
      `Failed to download image source "${source}": ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const url = new URL(source);
  const mimeType =
    inferMimeTypeFromContentType(response.headers.get('content-type')) ??
    inferMimeTypeFromBuffer(buffer) ??
    inferMimeTypeFromExtension(url.pathname);

  if (!mimeType) {
    throw new Error(`Could not determine image type for remote source "${source}".`);
  }

  const fallbackFileName = `source-image-${index}.${getExtensionForMimeType(mimeType)}`;
  const nameFromUrl = basename(url.pathname);

  return {
    fileName: nameFromUrl || fallbackFileName,
    mimeType,
    data: buffer.toString('base64'),
    size: buffer.length,
  };
}

async function loadImageSource(source: string, index: number): Promise<LoadedImageSource> {
  return isHttpUrl(source) ? loadRemoteImageSource(source, index) : loadLocalImageSource(source);
}

function resolveImageModel(provider: ImageProvider) {
  if (provider.model === 'gpt-5.4') {
    const model = getModel('openai', provider.model);
    if (!model) {
      throw new Error(`Could not resolve model "${provider.model}".`);
    }
    return model;
  }

  const model = getModel('google', provider.model);
  if (!model) {
    throw new Error(`Could not resolve model "${provider.model}".`);
  }
  return model;
}

function validateImageOptions(method: ImageMethod, provider: ImageProvider): void {
  if (provider.model === 'gpt-5.4') {
    const imageOptions = provider.imageOptions;
    if (!imageOptions) return;

    const openAIImageOptions = imageOptions as Record<string, unknown>;
    if ('aspectRatio' in openAIImageOptions) {
      throw new Error(
        'provider.imageOptions.aspectRatio is only supported for Google image models.'
      );
    }
    if ('imageSize' in openAIImageOptions) {
      throw new Error('provider.imageOptions.imageSize is only supported for Google image models.');
    }

    if (imageOptions.size !== undefined && !OPENAI_IMAGE_SIZES.includes(imageOptions.size)) {
      throw new Error(
        `provider.imageOptions.size must be one of: ${OPENAI_IMAGE_SIZES.join(', ')}.`
      );
    }

    if (method === 'create' && imageOptions.inputFidelity !== undefined) {
      throw new Error(
        'provider.imageOptions.inputFidelity is only supported for editImage() with OpenAI.'
      );
    }
    return;
  }

  const imageOptions = provider.imageOptions;
  if (!imageOptions) return;

  const googleImageOptions = imageOptions as Record<string, unknown>;
  for (const openAIOnlyKey of [
    'format',
    'quality',
    'background',
    'size',
    'partialImages',
    'inputFidelity',
    'moderation',
  ]) {
    if (openAIOnlyKey in googleImageOptions) {
      throw new Error(
        `provider.imageOptions.${openAIOnlyKey} is only supported for OpenAI image models.`
      );
    }
  }

  if (
    imageOptions.imageSize !== undefined &&
    !GOOGLE_IMAGE_SIZES.includes(imageOptions.imageSize)
  ) {
    throw new Error(
      `provider.imageOptions.imageSize must be one of: ${GOOGLE_IMAGE_SIZES.join(', ')}.`
    );
  }

  const allowedAspectRatios =
    provider.model === 'gemini-3.1-flash-image-preview'
      ? GOOGLE_FLASH_IMAGE_ASPECT_RATIOS
      : GOOGLE_PRO_IMAGE_ASPECT_RATIOS;

  if (
    imageOptions.aspectRatio !== undefined &&
    !allowedAspectRatios.includes(
      imageOptions.aspectRatio as GoogleFlashImageAspectRatio & GoogleProImageAspectRatio
    )
  ) {
    throw new Error(
      `provider.imageOptions.aspectRatio must be one of: ${allowedAspectRatios.join(', ')}.`
    );
  }
}

function buildOpenAIProviderOptions(
  method: ImageMethod,
  provider: OpenAIImageProvider,
  signal: AbortSignal
): Partial<OpenAIProviderOptions> {
  const imageOptions = provider.imageOptions;
  const tool: Record<string, unknown> = {
    type: 'image_generation',
    action: method === 'edit' ? 'edit' : 'generate',
  };

  if (imageOptions?.partialImages !== undefined) {
    tool.partial_images = imageOptions.partialImages;
  }
  if (imageOptions?.inputFidelity !== undefined) {
    tool.input_fidelity = imageOptions.inputFidelity;
  }
  if (imageOptions?.size !== undefined) {
    tool.size = imageOptions.size;
  }
  if (imageOptions?.quality !== undefined) {
    tool.quality = imageOptions.quality;
  }
  if (imageOptions?.background !== undefined) {
    tool.background = imageOptions.background;
  }
  if (imageOptions?.format !== undefined) {
    tool.output_format = imageOptions.format;
  }
  if (imageOptions?.moderation !== undefined) {
    tool.moderation = imageOptions.moderation;
  }

  return {
    ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
    signal,
    tools: [tool as unknown as NonNullable<OpenAIProviderOptions['tools']>[number]],
  };
}

function buildGoogleProviderOptions(
  provider: GoogleImageProvider,
  signal: AbortSignal
): Partial<GoogleProviderOptions> {
  const imageConfig: Record<string, string> = {};
  if (provider.imageOptions?.aspectRatio !== undefined) {
    imageConfig.aspectRatio = provider.imageOptions.aspectRatio;
  }
  if (provider.imageOptions?.imageSize !== undefined) {
    imageConfig.imageSize = provider.imageOptions.imageSize;
  }

  return {
    ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
    signal,
    responseModalities: ['IMAGE'],
    ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
  };
}

function getFirstFinalImage(
  message: BaseAssistantMessage<'openai' | 'google'>
): ImageContent | undefined {
  for (const block of message.content) {
    if (block.type !== 'response') continue;

    for (const content of block.content) {
      if (content.type === 'image' && content.metadata?.generationStage === 'final') {
        return content;
      }
    }
  }

  return undefined;
}

async function writeImage(filePath: string, image: ImageContent): Promise<void> {
  await writeFile(filePath, Buffer.from(image.data, 'base64'));
}

function getEventImageStage(
  event: BaseAssistantEvent<'openai' | 'google'>
): ImageStage | undefined {
  if (event.type === 'image_start') {
    return event.metadata?.generationStage;
  }
  if (event.type === 'image_frame' || event.type === 'image_end') {
    const stage = event.image.metadata?.generationStage;
    return stage === 'partial' || stage === 'thought' || stage === 'final' ? stage : undefined;
  }
  return undefined;
}

async function runImageRequest(
  method: ImageMethod,
  request: CreateImageRequest | EditImageRequest
): Promise<ImageResult> {
  assertImageProvider(request.provider);
  validateImageOptions(method, request.provider);

  const imageSources = normalizeImageSources(request.images);
  if (method === 'edit' && imageSources.length === 0) {
    throw new Error('editImage() requires at least one image source.');
  }

  const outputDir = resolve(request.outputDir);
  const baseName = sanitizeOutputStem(request.outputName);
  const updatesDir = join(outputDir, `${baseName}__updates`);

  await mkdir(outputDir, { recursive: true });
  await mkdir(updatesDir, { recursive: true });

  const loadedImages = await Promise.all(
    imageSources.map((source, index) => loadImageSource(source, index + 1))
  );

  const attachments = loadedImages.map((image, index) => ({
    id: `source-image-${index + 1}`,
    type: 'image' as const,
    fileName: image.fileName,
    mimeType: image.mimeType,
    size: image.size,
    content: image.data,
  }));

  const userMessage = buildUserMessage(request.prompt, attachments);
  const model = resolveImageModel(request.provider);
  const abortController = new AbortController();
  const counters: Record<ImageStage, number> = {
    partial: 0,
    thought: 0,
    final: 0,
  };

  let firstFinalUpdateSaved = false;
  let firstFinalImage: ImageContent | undefined;

  const saveUpdate = async (
    stage: ImageStage,
    image: ImageContent
  ): Promise<string | undefined> => {
    if (stage === 'final') {
      if (firstFinalUpdateSaved) {
        return undefined;
      }
      firstFinalUpdateSaved = true;
      firstFinalImage = image;
    }

    const index = ++counters[stage];
    const extension = getExtensionForMimeType(image.mimeType);
    const artifactPath = join(
      updatesDir,
      `${stage}-${String(index).padStart(3, '0')}.${extension}`
    );

    await writeImage(artifactPath, image);

    if (request.onUpdate) {
      await request.onUpdate({
        stage,
        path: artifactPath,
        mimeType: image.mimeType,
        index,
        model: request.provider.model,
      });
    }

    return artifactPath;
  };

  try {
    const providerOptions =
      request.provider.model === 'gpt-5.4'
        ? buildOpenAIProviderOptions(method, request.provider, abortController.signal)
        : buildGoogleProviderOptions(request.provider, abortController.signal);

    const eventStream = await sdkStream(
      model,
      {
        messages: [userMessage],
        ...(request.systemPrompt ? { systemPrompt: request.systemPrompt } : {}),
      },
      {
        keysAdapter: defaultKeysAdapter,
        providerOptions,
      }
    );

    for await (const event of eventStream) {
      const stage = getEventImageStage(event);
      if (!stage) continue;

      if (stage === 'partial' && event.type === 'image_frame') {
        await saveUpdate(stage, event.image);
      }

      if ((stage === 'thought' || stage === 'final') && event.type === 'image_end') {
        await saveUpdate(stage, event.image);
      }
    }

    const message = await eventStream.result();
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      throw new Error(
        message.errorMessage ||
          (message.stopReason === 'aborted'
            ? 'Image request was aborted.'
            : 'Image request failed.')
      );
    }

    const finalImage =
      firstFinalImage ?? getFirstFinalImage(message as BaseAssistantMessage<'openai' | 'google'>);
    if (!finalImage) {
      throw new Error(`Model "${request.provider.model}" did not return a final image.`);
    }

    if (!firstFinalUpdateSaved) {
      await saveUpdate('final', finalImage);
    }

    const extension = getExtensionForMimeType(finalImage.mimeType);
    const finalPath = join(outputDir, `${baseName}.${extension}`);
    await writeImage(finalPath, finalImage);

    return { path: finalPath };
  } catch (error) {
    abortController.abort();
    throw error;
  }
}

export async function createImage(request: CreateImageRequest): Promise<ImageResult> {
  return runImageRequest('create', request);
}

export async function editImage(request: EditImageRequest): Promise<ImageResult> {
  return runImageRequest('edit', request);
}
