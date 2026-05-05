import { AzureOpenAI, toFile } from 'openai';

import { sanitizeSurrogates } from '../../../utils/sanitize-unicode.js';
import { calculateImageCost } from '../../models/index.js';

import type {
  AzureOpenAIImageProviderOptions,
  BaseImageResult,
  Content,
  ImageContent,
  ImageGenerationContext,
  ImageModel,
  ImageUsage,
} from '../../../types/index.js';
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from 'openai/resources/images.js';

export const DEFAULT_AZURE_OPENAI_IMAGE_API_VERSION = '2025-04-01-preview';
const DEFAULT_AZURE_OPENAI_IMAGE_MIME_TYPE = 'image/png';

interface ResolvedAzureOpenAIImageConfig {
  apiVersion: string;
  baseURL: string;
}

export function resolveAzureOpenAIImageDeploymentName(
  model: ImageModel<'azure-openai'>,
  options: AzureOpenAIImageProviderOptions
): string {
  return options.azureDeploymentName?.trim() || model.id;
}

export function resolveAzureOpenAIImageConfig(
  model: ImageModel<'azure-openai'>,
  options: AzureOpenAIImageProviderOptions
): ResolvedAzureOpenAIImageConfig {
  const explicitApiVersion = options.azureApiVersion?.trim();
  const candidates = [
    options.azureBaseURL?.trim(),
    options.azureEndpoint?.trim() ? buildEndpointBaseURL(options.azureEndpoint) : undefined,
    options.azureResourceName?.trim() ? buildResourceBaseURL(options.azureResourceName) : undefined,
    model.baseUrl.trim() ? model.baseUrl : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const parsed = normalizeAzureOpenAIImageBaseURL(candidate);
    if (parsed?.baseURL) {
      return {
        apiVersion:
          explicitApiVersion || parsed.apiVersion || DEFAULT_AZURE_OPENAI_IMAGE_API_VERSION,
        baseURL: parsed.baseURL,
      };
    }
  }

  throw new Error(
    'Azure OpenAI image base URL is required. Pass azureBaseURL, azureEndpoint, azureResourceName, or configure model.baseUrl.'
  );
}

export function createAzureOpenAIImageClient(
  model: ImageModel<'azure-openai'>,
  options: AzureOpenAIImageProviderOptions
): AzureOpenAI {
  if (!options.apiKey) {
    throw new Error('Azure OpenAI API key is required.');
  }

  const { apiVersion, baseURL } = resolveAzureOpenAIImageConfig(model, options);

  return new AzureOpenAI({
    apiKey: options.apiKey,
    apiVersion,
    baseURL,
    deployment: resolveAzureOpenAIImageDeploymentName(model, options),
    dangerouslyAllowBrowser: true,
    defaultHeaders: model.headers,
  });
}

export function buildAzureOpenAIImageGenerateBody(
  model: ImageModel<'azure-openai'>,
  context: ImageGenerationContext,
  options: AzureOpenAIImageProviderOptions
): ImageGenerateParamsNonStreaming {
  const {
    apiKey,
    signal,
    azureApiVersion,
    azureBaseURL,
    azureEndpoint,
    azureResourceName,
    azureDeploymentName,
    input_fidelity,
    partial_images,
    response_format,
    ...nativeOptions
  } = options;

  void apiKey;
  void signal;
  void azureApiVersion;
  void azureBaseURL;
  void azureEndpoint;
  void azureResourceName;
  void azureDeploymentName;
  void input_fidelity;
  void partial_images;
  void response_format;

  return {
    ...nativeOptions,
    model: resolveAzureOpenAIImageDeploymentName(model, options),
    prompt: sanitizeSurrogates(context.prompt),
    stream: false,
  };
}

export async function buildAzureOpenAIImageEditBody(
  model: ImageModel<'azure-openai'>,
  context: ImageGenerationContext,
  options: AzureOpenAIImageProviderOptions
): Promise<ImageEditParamsNonStreaming> {
  if (!context.images || context.images.length === 0) {
    throw new Error('Azure OpenAI image edits require at least one input image.');
  }

  const {
    apiKey,
    signal,
    azureApiVersion,
    azureBaseURL,
    azureEndpoint,
    azureResourceName,
    azureDeploymentName,
    partial_images,
    response_format,
    ...nativeOptions
  } = options;

  void apiKey;
  void signal;
  void azureApiVersion;
  void azureBaseURL;
  void azureEndpoint;
  void azureResourceName;
  void azureDeploymentName;
  void partial_images;
  void response_format;

  const uploadableImages = await Promise.all(
    context.images.map((image, index) => toUploadableImage(image, `image-input-${index + 1}`))
  );

  const editBody: ImageEditParamsNonStreaming = {
    ...nativeOptions,
    model: resolveAzureOpenAIImageDeploymentName(model, options),
    prompt: sanitizeSurrogates(context.prompt),
    image: uploadableImages,
    stream: false,
  };

  if (context.mask) {
    editBody.mask = await toUploadableImage(context.mask, 'image-mask');
  }

  return editBody;
}

export function normalizeAzureOpenAIImageResponse(
  response: ImagesResponse,
  options: AzureOpenAIImageProviderOptions
): Pick<BaseImageResult<'azure-openai'>, 'content' | 'images' | 'usage'> {
  const mimeType = getAzureOpenAIImageMimeType(response, options);
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
        generationProvider: 'azure-openai',
        generationStage: 'final',
        imageIndex: index,
        ...(image.revised_prompt ? { revisedPrompt: image.revised_prompt } : {}),
      },
    };

    images.push(generatedImage);
    content.push(generatedImage);
  }

  const usage = normalizeAzureOpenAIImageUsage(response);
  return { content, images, usage };
}

export async function generateAzureOpenAIImage(
  model: ImageModel<'azure-openai'>,
  context: ImageGenerationContext,
  options: AzureOpenAIImageProviderOptions,
  id: string
): Promise<BaseImageResult<'azure-openai'>> {
  const startTimestamp = Date.now();
  const client = createAzureOpenAIImageClient(model, options);
  const isEdit = Boolean(context.images?.length || context.mask);

  const response = isEdit
    ? await client.images.edit(await buildAzureOpenAIImageEditBody(model, context, options), {
        signal: options.signal,
      })
    : await client.images.generate(buildAzureOpenAIImageGenerateBody(model, context, options), {
        signal: options.signal,
      });

  const normalized = normalizeAzureOpenAIImageResponse(response, options);
  normalized.usage.cost = calculateImageCost(model, normalized.usage);

  return {
    id,
    api: 'azure-openai',
    model,
    response,
    content: normalized.content,
    images: normalized.images,
    usage: normalized.usage,
    timestamp: Date.now(),
    duration: Date.now() - startTimestamp,
  };
}

function buildEndpointBaseURL(endpoint: string): string {
  return `${normalizeBaseURL(endpoint)}/openai`;
}

function buildResourceBaseURL(resourceName: string): string {
  return `https://${resourceName.trim()}.openai.azure.com/openai`;
}

function normalizeAzureOpenAIImageBaseURL(
  value: string
): { baseURL: string; apiVersion?: string } | undefined {
  try {
    const url = new URL(value);
    const apiVersion = url.searchParams.get('api-version')?.trim() || undefined;
    const segments = url.pathname.split('/').filter(Boolean);
    const openAIIndex = segments.findIndex((segment) => segment === 'openai');

    if (openAIIndex >= 0) {
      url.pathname = `/${segments.slice(0, openAIIndex + 1).join('/')}`;
    } else {
      url.pathname = `${normalizePath(url.pathname)}/openai`;
    }

    url.search = '';
    url.hash = '';

    const normalized = normalizeBaseURL(url.toString());
    if (!isValidBaseURL(normalized)) {
      return undefined;
    }

    return apiVersion ? { baseURL: normalized, apiVersion } : { baseURL: normalized };
  } catch {
    return undefined;
  }
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

function normalizeAzureOpenAIImageUsage(response: ImagesResponse): ImageUsage {
  const usage = response.usage;
  const outputText = usage?.output_tokens_details?.text_tokens || 0;
  const outputImage =
    usage?.output_tokens_details?.image_tokens ??
    Math.max((usage?.output_tokens || 0) - outputText, 0);

  return {
    input: usage?.input_tokens || 0,
    inputText: usage?.input_tokens_details?.text_tokens || 0,
    inputImage: usage?.input_tokens_details?.image_tokens || 0,
    output: usage?.output_tokens || 0,
    outputText,
    outputImage,
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

function getAzureOpenAIImageMimeType(
  response: ImagesResponse,
  options: AzureOpenAIImageProviderOptions
): ImageContent['mimeType'] {
  const format = response.output_format ?? options.output_format ?? 'png';

  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'png':
    default:
      return DEFAULT_AZURE_OPENAI_IMAGE_MIME_TYPE;
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

function isValidBaseURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/u, '');
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/u, '');
  return normalized.length > 0 ? normalized : '';
}
