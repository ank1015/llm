import { sanitizeProviderOptions } from '../logging/sanitize.js';
import { isGatewayImageApi } from '../vault/provider-key-vault.js';

import { GatewayProxyError } from './error.js';

import type { GatewayEnv } from '../context.js';
import type { ImageGenerateRequest } from '../contracts/index.js';
import type {
  BaseImageResult,
  ImageApi,
  ImageContent,
  ImageGenerationContext,
  ImageModel,
} from '@ank1015/llm-core';
import type { Context } from 'hono';

export async function runImageProxy(
  c: Context<GatewayEnv>,
  body: ImageGenerateRequest
): Promise<BaseImageResult<ImageApi>> {
  const requestId = c.get('requestId');
  const senderId = c.get('senderId');
  const services = c.get('services');

  if (!isGatewayImageApi(body.api)) {
    throw new GatewayProxyError(
      `Unsupported image provider "${body.api}".`,
      'unsupported_image_api',
      400
    );
  }

  const model = services.runtime.getImageModel(body.api, body.modelId as never);
  if (!model) {
    throw new GatewayProxyError(
      `Unknown image model "${body.modelId}" for provider "${body.api}".`,
      'unknown_image_model',
      400
    );
  }

  const apiKey = services.vault.getApiKey(body.api);
  if (!apiKey) {
    throw new GatewayProxyError(
      `No provider key is configured for "${body.api}".`,
      'provider_key_missing',
      503
    );
  }

  validateImagePayloadLimits(
    body,
    services.config.maxImages,
    services.config.imagePayloadLimitBytes
  );

  services.requestLog.startRequest({
    requestId,
    clientRequestId: body.requestId,
    senderId,
    kind: 'image',
    api: body.api,
    modelId: body.modelId,
    input: body,
  });

  const signalController = new AbortController();
  const handleAbort = (): void => {
    signalController.abort();
  };

  c.req.raw.signal.addEventListener('abort', handleAbort, { once: true });

  const context: ImageGenerationContext = {
    prompt: body.prompt,
    ...(body.images !== undefined ? { images: body.images as ImageContent[] } : {}),
    ...(body.mask !== undefined ? { mask: body.mask as ImageContent } : {}),
  };
  const providerOptions = {
    ...(sanitizeProviderOptions(body.providerOptions) ?? {}),
    apiKey,
    signal: signalController.signal,
  };

  try {
    const result = await services.runtime.generateImage(
      model as ImageModel<ImageApi>,
      context,
      providerOptions as never,
      body.requestId ?? requestId
    );

    services.requestLog.completeRequest({
      requestId,
      status: 'ok',
      output: result,
      usage: result.usage,
    });

    return result;
  } catch (error) {
    const aborted = signalController.signal.aborted || c.req.raw.signal.aborted;
    services.requestLog.completeRequest({
      requestId,
      status: aborted ? 'aborted' : 'error',
      errorCode: aborted ? 'aborted' : 'image_failed',
      errorMessage: getErrorMessage(error),
    });

    if (aborted) {
      throw new GatewayProxyError('Image request was aborted.', 'aborted', 499);
    }

    throw new GatewayProxyError(getErrorMessage(error), 'image_failed', 502);
  } finally {
    c.req.raw.signal.removeEventListener('abort', handleAbort);
  }
}

function validateImagePayloadLimits(
  body: ImageGenerateRequest,
  maxImages: number,
  payloadLimitBytes: number
): void {
  const imageCount = (body.images?.length ?? 0) + (body.mask ? 1 : 0);
  if (imageCount > maxImages) {
    throw new GatewayProxyError(
      `Image request can include at most ${maxImages} image payloads.`,
      'too_many_images',
      413
    );
  }

  const payloadBytes =
    (body.images ?? []).reduce((total, image) => total + estimateBase64Bytes(image.data), 0) +
    (body.mask ? estimateBase64Bytes(body.mask.data) : 0);

  if (payloadBytes > payloadLimitBytes) {
    throw new GatewayProxyError(
      `Image payloads must total ${payloadLimitBytes} bytes or less.`,
      'image_payload_too_large',
      413
    );
  }
}

function estimateBase64Bytes(value: string): number {
  const normalized = value.replace(/\s/gu, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
