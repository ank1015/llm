import OpenAI, { toFile } from 'openai';

import { sanitizeSurrogates } from '../../../utils/sanitize-unicode.js';
import { calculateImageCost } from '../../models/index.js';

import type {
  BaseImageResult,
  Content,
  ImageContent,
  ImageGenerationContext,
  ImageUsage,
  ImageModel,
  OpenAIImageProviderOptions,
} from '../../../types/index.js';
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from 'openai/resources/images.js';

const DEFAULT_OPENAI_IMAGE_MIME_TYPE = 'image/png';

export function createOpenAIImageClient(model: ImageModel<'openai'>, apiKey: string): OpenAI {
  if (!apiKey) {
    throw new Error('OpenAI API key is required.');
  }

  return new OpenAI({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: model.headers,
  });
}

export function buildOpenAIImageGenerateBody(
  model: ImageModel<'openai'>,
  context: ImageGenerationContext,
  options: OpenAIImageProviderOptions
): ImageGenerateParamsNonStreaming {
  const { apiKey, signal, input_fidelity, partial_images, response_format, ...nativeOptions } =
    options;

  void apiKey;
  void signal;
  void input_fidelity;
  void partial_images;
  void response_format;

  return {
    ...nativeOptions,
    model: model.id,
    prompt: sanitizeSurrogates(context.prompt),
    stream: false,
  };
}

export async function buildOpenAIImageEditBody(
  model: ImageModel<'openai'>,
  context: ImageGenerationContext,
  options: OpenAIImageProviderOptions
): Promise<ImageEditParamsNonStreaming> {
  if (!context.images || context.images.length === 0) {
    throw new Error('OpenAI image edits require at least one input image.');
  }

  const { apiKey, signal, partial_images, response_format, ...nativeOptions } = options;

  void apiKey;
  void signal;
  void partial_images;
  void response_format;

  const uploadableImages = await Promise.all(
    context.images.map((image, index) => toUploadableImage(image, `image-input-${index + 1}`))
  );

  const editBody: ImageEditParamsNonStreaming = {
    ...nativeOptions,
    model: model.id,
    prompt: sanitizeSurrogates(context.prompt),
    image: uploadableImages,
    stream: false,
  };

  if (context.mask) {
    editBody.mask = await toUploadableImage(context.mask, 'image-mask');
  }

  return editBody;
}

export function normalizeOpenAIImageResponse(
  response: ImagesResponse,
  options: OpenAIImageProviderOptions
): Pick<BaseImageResult<'openai'>, 'content' | 'images' | 'usage'> {
  const mimeType = getOpenAIImageMimeType(response, options);
  const content: Content = [];
  const images: ImageContent[] = [];

  for (const [index, image] of (response.data || []).entries()) {
    if (!image.b64_json) {
      continue;
    }

    const generatedImage: ImageContent = {
      type: 'image',
      data: image.b64_json,
      mimeType,
      metadata: {
        generationProvider: 'openai',
        generationStage: 'final',
        imageIndex: index,
        ...(image.revised_prompt ? { revisedPrompt: image.revised_prompt } : {}),
      },
    };

    images.push(generatedImage);
    content.push(generatedImage);
  }

  const usage = normalizeOpenAIImageUsage(response);
  return { content, images, usage };
}

export async function generateOpenAIImage(
  model: ImageModel<'openai'>,
  context: ImageGenerationContext,
  options: OpenAIImageProviderOptions,
  id: string
): Promise<BaseImageResult<'openai'>> {
  const startTimestamp = Date.now();
  const client = createOpenAIImageClient(model, options.apiKey);
  const isEdit = Boolean(context.images?.length || context.mask);

  const response = isEdit
    ? await client.images.edit(await buildOpenAIImageEditBody(model, context, options), {
        signal: options.signal,
      })
    : await client.images.generate(buildOpenAIImageGenerateBody(model, context, options), {
        signal: options.signal,
      });

  const normalized = normalizeOpenAIImageResponse(response, options);
  normalized.usage.cost = calculateImageCost(model, normalized.usage);

  return {
    id,
    api: 'openai',
    model,
    response,
    content: normalized.content,
    images: normalized.images,
    usage: normalized.usage,
    timestamp: Date.now(),
    duration: Date.now() - startTimestamp,
  };
}

async function toUploadableImage(image: ImageContent, fallbackName: string): Promise<File> {
  const fileName =
    typeof image.metadata?.fileName === 'string' && image.metadata.fileName.length > 0
      ? image.metadata.fileName
      : `${fallbackName}.${getFileExtensionForMimeType(image.mimeType)}`;

  return toFile(Buffer.from(image.data, 'base64'), fileName, {
    type: image.mimeType,
  });
}

function normalizeOpenAIImageUsage(response: ImagesResponse): ImageUsage {
  const usage = response.usage;

  return {
    input: usage?.input_tokens || 0,
    inputText: usage?.input_tokens_details?.text_tokens || 0,
    inputImage: usage?.input_tokens_details?.image_tokens || 0,
    output: usage?.output_tokens || 0,
    outputText: usage?.output_tokens_details?.text_tokens || 0,
    outputImage: usage?.output_tokens_details?.image_tokens || 0,
    reasoning: 0,
    totalTokens: usage?.total_tokens || 0,
    cost: {
      inputText: 0,
      inputImage: 0,
      outputText: 0,
      outputImage: 0,
      reasoning: 0,
      total: 0,
    },
  };
}

function getOpenAIImageMimeType(
  response: ImagesResponse,
  options: OpenAIImageProviderOptions
): ImageContent['mimeType'] {
  const format = response.output_format ?? options.output_format ?? 'png';

  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return DEFAULT_OPENAI_IMAGE_MIME_TYPE;
  }
}

function getFileExtensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}
