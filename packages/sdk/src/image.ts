import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, parse } from 'node:path';

import { generateImage as coreGenerateImage, getImageModel } from '@ank1015/llm-core';

import { getSdkConfig } from './config.js';
import { resolveProviderCredentials } from './keys.js';

import type { ResolveProviderCredentialsError } from './keys.js';
import type {
  BaseImageResult,
  GoogleImageProviderOptions,
  ImageApi,
  ImageContent,
  ImageModel,
  ImageUsage,
  OpenAIImageProviderOptions,
} from '@ank1015/llm-core';

const SDK_IMAGE_MODEL_CATALOG = {
  'nano-banana': {
    api: 'google',
    providerModelId: 'gemini-3.1-flash-image-preview',
  },
  'nano-banana-pro': {
    api: 'google',
    providerModelId: 'gemini-3-pro-image-preview',
  },
  'gpt-image': {
    api: 'openai',
    providerModelId: 'gpt-image-1.5',
  },
} as const;

export const ImageModelIds = Object.keys(SDK_IMAGE_MODEL_CATALOG) as ImageModelId[];

export type ImageModelId = keyof typeof SDK_IMAGE_MODEL_CATALOG;

type GoogleImageModelId = Extract<ImageModelId, 'nano-banana' | 'nano-banana-pro'>;
type OpenAIImageModelId = Extract<ImageModelId, 'gpt-image'>;

type ApiForImageModelId<TModelId extends ImageModelId> = TModelId extends OpenAIImageModelId
  ? 'openai'
  : 'google';

type ImageResultForInput<TInput extends ImageInput> = ImageResult<
  ApiForImageModelId<TInput['model']>,
  TInput['model']
>;

type GoogleImageAspectRatio = NonNullable<
  NonNullable<GoogleImageProviderOptions['imageConfig']>['aspectRatio']
>;
type GoogleImageSize = NonNullable<
  NonNullable<GoogleImageProviderOptions['imageConfig']>['imageSize']
>;
type GoogleImagePersonGeneration = NonNullable<
  NonNullable<GoogleImageProviderOptions['imageConfig']>['personGeneration']
>;
type GoogleProminentPeople = NonNullable<
  NonNullable<GoogleImageProviderOptions['imageConfig']>['prominentPeople']
>;

type OpenAIImageSize = NonNullable<OpenAIImageProviderOptions['size']>;
type OpenAIImageQuality = NonNullable<OpenAIImageProviderOptions['quality']>;
type OpenAIImageBackground = NonNullable<OpenAIImageProviderOptions['background']>;
type OpenAIImageFormat = NonNullable<OpenAIImageProviderOptions['output_format']>;
type OpenAIImageCompression = NonNullable<OpenAIImageProviderOptions['output_compression']>;
type OpenAIImageModeration = NonNullable<OpenAIImageProviderOptions['moderation']>;
type OpenAIImageCount = NonNullable<OpenAIImageProviderOptions['n']>;
type OpenAIImageFidelity = NonNullable<OpenAIImageProviderOptions['input_fidelity']>;

export interface NanoBananaSettings {
  aspectRatio?: GoogleImageAspectRatio;
  imageSize?: GoogleImageSize;
  personGeneration?: GoogleImagePersonGeneration;
  prominentPeople?: GoogleProminentPeople;
  googleSearch?: boolean;
  includeText?: boolean;
}

export interface GptImageSettings {
  size?: OpenAIImageSize;
  quality?: OpenAIImageQuality;
  background?: OpenAIImageBackground;
  format?: OpenAIImageFormat;
  compression?: OpenAIImageCompression;
  moderation?: OpenAIImageModeration;
  count?: OpenAIImageCount;
  fidelity?: OpenAIImageFidelity;
}

interface BaseSdkImageInput<TModelId extends ImageModelId> {
  model: TModelId;
  prompt: string;
  output: string;
  keysFilePath?: string;
  requestId?: string;
  signal?: AbortSignal;
}

export interface NanoBananaInput<
  TModelId extends GoogleImageModelId = GoogleImageModelId,
> extends BaseSdkImageInput<TModelId> {
  imagePaths?: string[];
  settings?: NanoBananaSettings;
}

export interface GptImageInput extends BaseSdkImageInput<'gpt-image'> {
  imagePaths?: string[];
  maskPath?: string;
  settings?: GptImageSettings;
}

export type ImageInput = NanoBananaInput | GptImageInput;

export interface ImageResult<
  TApi extends ImageApi = ImageApi,
  TModelId extends ImageModelId = ImageModelId,
> {
  model: TModelId;
  api: TApi;
  providerModelId: string;
  path?: string;
  paths: string[];
  text: string;
  usage: ImageUsage;
  result: BaseImageResult<TApi>;
}

export interface UnsupportedImageModelError {
  code: 'unsupported_image_model';
  message: string;
  model: string;
  supportedModels: ImageModelId[];
}

export interface CoreImageModelNotFoundError {
  code: 'core_model_not_found';
  message: string;
  model: ImageModelId;
  api: ImageApi;
  providerModelId: string;
}

type OpenAICredentialsError = ResolveProviderCredentialsError<'openai'>;
type GoogleCredentialsError = ResolveProviderCredentialsError<'google'>;

export type ResolveImageInputError =
  | UnsupportedImageModelError
  | CoreImageModelNotFoundError
  | OpenAICredentialsError
  | GoogleCredentialsError;

type SetupFailure = {
  model: string;
  keysFilePath: string;
  error: ResolveImageInputError;
};

export class ImageInputError extends Error {
  readonly code: ResolveImageInputError['code'];
  readonly details: ResolveImageInputError;
  readonly model: string;
  readonly keysFilePath: string;

  constructor(failure: SetupFailure) {
    super(failure.error.message);
    this.name = 'ImageInputError';
    this.code = failure.error.code;
    this.details = failure.error;
    this.model = failure.model;
    this.keysFilePath = failure.keysFilePath;
  }
}

interface ResolvedImageInputSuccess<TApi extends ImageApi = ImageApi> {
  ok: true;
  modelId: ImageModelId;
  api: TApi;
  keysFilePath: string;
  providerModelId: string;
  model: ImageModel<TApi>;
  apiKey: string;
}

interface ResolveImageInputFailure {
  ok: false;
  model: string;
  keysFilePath: string;
  error: ResolveImageInputError;
}

type ResolveImageInputResult = ResolvedImageInputSuccess | ResolveImageInputFailure;

export function isImageModelId(value: string): value is ImageModelId {
  return ImageModelIds.includes(value as ImageModelId);
}

export async function image<TInput extends ImageInput>(
  input: TInput
): Promise<ImageResultForInput<TInput>> {
  const resolved = await resolveImageInput(
    input.keysFilePath !== undefined
      ? {
          model: input.model,
          keysFilePath: input.keysFilePath,
        }
      : {
          model: input.model,
        }
  );

  if (!resolved.ok) {
    throw new ImageInputError(resolved);
  }

  const context = await buildImageContext(input);
  const providerOptions =
    resolved.api === 'google'
      ? buildGoogleImageProviderOptions(input as NanoBananaInput, resolved.apiKey)
      : buildOpenAIImageProviderOptions(input as GptImageInput, resolved.apiKey);

  const result = await coreGenerateImage(
    resolved.model as never,
    context,
    providerOptions as never,
    input.requestId
  );

  if (result.images.length === 0) {
    throw new Error(buildNoImagesGeneratedMessage(result));
  }

  const paths = await saveGeneratedImages(result.images, input.output);

  return {
    model: input.model,
    api: resolved.api,
    providerModelId: resolved.providerModelId,
    ...(paths.length === 1 ? { path: paths[0] } : {}),
    paths,
    text: getImageResultText(result),
    usage: result.usage,
    result,
  } as ImageResultForInput<TInput>;
}

async function resolveImageInput(input: {
  model: string;
  keysFilePath?: string;
}): Promise<ResolveImageInputResult> {
  const keysFilePath = input.keysFilePath ?? getSdkConfig().keysFilePath;

  if (!isImageModelId(input.model)) {
    return {
      ok: false,
      model: input.model,
      keysFilePath,
      error: {
        code: 'unsupported_image_model',
        message: `Unsupported image model "${input.model}". Available models: ${ImageModelIds.join(', ')}`,
        model: input.model,
        supportedModels: [...ImageModelIds],
      },
    };
  }

  const entry = SDK_IMAGE_MODEL_CATALOG[input.model];
  const model = getImageModel(entry.api, entry.providerModelId);

  if (!model) {
    return {
      ok: false,
      model: input.model,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core image model "${entry.providerModelId}" was not found for ${input.model}`,
        model: input.model,
        api: entry.api,
        providerModelId: entry.providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, entry.api);
  if (!credentialsResult.ok) {
    return {
      ok: false,
      model: input.model,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  return {
    ok: true,
    modelId: input.model,
    api: entry.api,
    keysFilePath,
    providerModelId: entry.providerModelId,
    model,
    apiKey: credentialsResult.credentials.apiKey,
  } as ResolvedImageInputSuccess;
}

async function buildImageContext(input: ImageInput): Promise<{
  prompt: string;
  images?: ImageContent[];
  mask?: ImageContent;
}> {
  const images = input.imagePaths ? await Promise.all(input.imagePaths.map(readImageFromPath)) : [];

  if (input.model === 'gpt-image' && input.maskPath) {
    if (images.length === 0) {
      throw new Error('gpt-image mask editing requires at least one imagePaths entry.');
    }

    return {
      prompt: input.prompt,
      ...(images.length > 0 ? { images } : {}),
      mask: await readImageFromPath(input.maskPath),
    };
  }

  return {
    prompt: input.prompt,
    ...(images.length > 0 ? { images } : {}),
  };
}

function buildGoogleImageProviderOptions(
  input: NanoBananaInput,
  apiKey: string
): GoogleImageProviderOptions {
  const settings = input.settings;
  const imageConfig = compactObject({
    aspectRatio: settings?.aspectRatio,
    imageSize: settings?.imageSize,
    personGeneration: settings?.personGeneration,
    prominentPeople: settings?.prominentPeople,
  });

  return compactObject({
    apiKey,
    signal: input.signal,
    responseModalities: settings?.includeText === false ? ['IMAGE'] : ['TEXT', 'IMAGE'],
    ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
    ...(settings?.googleSearch ? { tools: [{ googleSearch: {} }] } : {}),
  }) as GoogleImageProviderOptions;
}

function buildOpenAIImageProviderOptions(
  input: GptImageInput,
  apiKey: string
): OpenAIImageProviderOptions {
  const settings = input.settings;

  return compactObject({
    apiKey,
    signal: input.signal,
    size: settings?.size,
    quality: settings?.quality,
    background: settings?.background,
    output_format: settings?.format,
    output_compression: settings?.compression,
    moderation: settings?.moderation,
    n: settings?.count,
    input_fidelity: settings?.fidelity,
  }) as OpenAIImageProviderOptions;
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
    images.map(async (image, index) => {
      const filePath = paths[index]!;
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, Buffer.from(image.data, 'base64'));
    })
  );

  return paths;
}

function buildOutputPaths(images: ImageContent[], output: string): string[] {
  const parsed = parse(output);
  const hasBaseName = parsed.base.length > 0 || parsed.name.length > 0;

  if (!hasBaseName) {
    throw new Error(`Output path "${output}" must include a file name.`);
  }

  const baseName = parsed.name || parsed.base;

  return images.map((image, index) => {
    const extension = `.${getFileExtensionForMimeType(image.mimeType)}`;
    const fileName =
      images.length === 1 ? `${baseName}${extension}` : `${baseName}-${index + 1}${extension}`;
    return parsed.dir ? join(parsed.dir, fileName) : fileName;
  });
}

function getImageResultText(result: BaseImageResult<ImageApi>): string {
  let text = '';

  for (const content of result.content) {
    if (content.type === 'text') {
      text += content.content;
    }
  }

  return text;
}

function buildNoImagesGeneratedMessage(result: BaseImageResult<ImageApi>): string {
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
      throw new Error(
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

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as Partial<T>;
}
