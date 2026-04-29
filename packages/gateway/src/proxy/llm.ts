import { sanitizeProviderOptions } from '../logging/sanitize.js';
import { HEARTBEAT_INTERVAL_MS, SSE_HEADERS, toSseCommentFrame, toSseDataFrame } from '../sse.js';
import { isGatewayApi } from '../vault/provider-key-vault.js';

import { GatewayProxyError } from './error.js';

import type { GatewayEnv } from '../context.js';
import type { LlmStreamRequest } from '../contracts/index.js';
import type { GatewayApi, GatewayProviderCredentials } from '../vault/provider-key-vault.js';
import type {
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Context as LlmContext,
  Message,
  Model,
  Tool,
} from '@ank1015/llm-core';
import type { Context } from 'hono';

type StreamLike<TApi extends Api> = AsyncIterable<BaseAssistantEvent<TApi>> & {
  result(): Promise<BaseAssistantMessage<TApi>>;
};

export async function createLlmStreamProxyResponse(
  c: Context<GatewayEnv>,
  body: LlmStreamRequest
): Promise<Response> {
  const requestId = c.get('requestId');
  const senderId = c.get('senderId');
  const services = c.get('services');

  if (!isGatewayApi(body.api)) {
    throw new GatewayProxyError(
      `Unsupported gateway provider "${body.api}".`,
      'unsupported_api',
      400
    );
  }

  const model = services.runtime.getModel(body.api, body.modelId as never);
  if (!model) {
    throw new GatewayProxyError(
      `Unknown model "${body.modelId}" for provider "${body.api}".`,
      'unknown_model',
      400
    );
  }

  const providerCredentials = services.vault.getProviderCredentials(body.api);
  if (!providerCredentials) {
    throw new GatewayProxyError(
      `No provider credentials are configured for "${body.api}".`,
      'provider_key_missing',
      503
    );
  }

  services.requestLog.startRequest({
    requestId,
    clientRequestId: body.requestId,
    senderId,
    kind: 'llm',
    api: body.api,
    modelId: body.modelId,
    input: body,
  });

  const signalController = new AbortController();
  const handleAbort = (): void => {
    signalController.abort();
  };

  c.req.raw.signal.addEventListener('abort', handleAbort, { once: true });

  const context: LlmContext = {
    messages: body.messages as Message[],
  };
  if (body.systemPrompt !== undefined) {
    context.systemPrompt = body.systemPrompt;
  }
  if (body.tools !== undefined) {
    context.tools = body.tools as Tool[];
  }

  const providerOptions = {
    ...(sanitizeProviderOptions(body.providerOptions) ?? {}),
    ...buildStoredProviderOptions(body.api, providerCredentials),
    signal: signalController.signal,
  };

  let upstreamStream: StreamLike<Api>;

  try {
    upstreamStream = services.runtime.stream(
      model as never,
      context,
      providerOptions as never,
      body.requestId ?? requestId
    ) as StreamLike<Api>;
  } catch (error) {
    c.req.raw.signal.removeEventListener('abort', handleAbort);
    services.requestLog.completeRequest({
      requestId,
      status: 'error',
      errorCode: 'stream_start_failed',
      errorMessage: getErrorMessage(error),
    });
    throw new GatewayProxyError(getErrorMessage(error), 'stream_start_failed', 502);
  }

  const responseStream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let closed = false;
      let eventSequence = 0;
      let finalMessage: BaseAssistantMessage<Api> | undefined;

      const heartbeat = setInterval(() => {
        enqueue(toSseCommentFrame('keep-alive'));
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = (): void => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeat);
        c.req.raw.signal.removeEventListener('abort', handleAbort);

        try {
          controller.close();
        } catch {
          // The stream may already be closed if the client disconnected first.
        }
      };

      const enqueue = (chunk: Uint8Array): boolean => {
        if (closed) {
          return false;
        }

        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          signalController.abort();
          closed = true;
          return false;
        }
      };

      try {
        for await (const event of upstreamStream) {
          finalMessage = event.message;
          eventSequence += 1;
          enqueue(toSseDataFrame(event));
          bestEffort(() => {
            services.requestLog.appendEvent(requestId, eventSequence, event);
          });
        }

        const resolvedMessage = await upstreamStream.result();
        finalMessage = resolvedMessage;
        bestEffort(() => {
          services.requestLog.completeRequest({
            requestId,
            status: mapStopReasonToStatus(resolvedMessage.stopReason),
            errorCode:
              resolvedMessage.stopReason === 'error' || resolvedMessage.stopReason === 'aborted'
                ? resolvedMessage.stopReason
                : null,
            errorMessage: resolvedMessage.error?.message ?? resolvedMessage.errorMessage ?? null,
            output: resolvedMessage,
            usage: resolvedMessage.usage,
          });
        });
      } catch (error) {
        const aborted = signalController.signal.aborted || c.req.raw.signal.aborted;
        const errorMessage = getErrorMessage(error);

        if (!aborted) {
          const syntheticEvent = createSyntheticErrorEvent(
            model as Model<Api>,
            body.requestId ?? requestId,
            errorMessage
          );
          finalMessage = syntheticEvent.message;
          eventSequence += 1;
          enqueue(toSseDataFrame(syntheticEvent));
          bestEffort(() => {
            services.requestLog.appendEvent(requestId, eventSequence, syntheticEvent);
          });
        }

        bestEffort(() => {
          services.requestLog.completeRequest({
            requestId,
            status: aborted ? 'aborted' : 'error',
            errorCode: aborted ? 'aborted' : 'stream_failed',
            errorMessage,
            ...(finalMessage !== undefined
              ? { output: finalMessage, usage: finalMessage.usage }
              : {}),
          });
        });
      } finally {
        cleanup();
      }
    },
    cancel() {
      signalController.abort();
      c.req.raw.signal.removeEventListener('abort', handleAbort);
    },
  });

  return new Response(responseStream, {
    headers: {
      ...SSE_HEADERS,
      'X-Gateway-Request-Id': requestId,
    },
  });
}

function bestEffort(fn: () => void): void {
  try {
    fn();
  } catch {
    // Logging must not break an in-flight proxy response.
  }
}

function createSyntheticErrorEvent(
  model: Model<Api>,
  id: string,
  errorMessage: string
): BaseAssistantEvent<Api> {
  const message: BaseAssistantMessage<Api> = {
    role: 'assistant',
    api: model.api,
    id,
    model,
    message: {} as BaseAssistantMessage<Api>['message'],
    error: {
      message: errorMessage,
      canRetry: false,
    },
    errorMessage,
    timestamp: Date.now(),
    duration: 0,
    stopReason: 'error',
    content: [],
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };

  return {
    type: 'error',
    reason: 'error',
    message,
  };
}

function buildStoredProviderOptions(
  api: GatewayApi,
  credentials: GatewayProviderCredentials
): Record<string, unknown> {
  if (api !== 'azure-openai') {
    return { apiKey: credentials.apiKey };
  }

  if (!('azureDeploymentUrl' in credentials) || !credentials.azureDeploymentUrl) {
    throw new GatewayProxyError(
      'Azure OpenAI deployment URL is not configured.',
      'provider_config_missing',
      503
    );
  }

  const endpoint = parseAzureOpenAIDeploymentUrl(credentials.azureDeploymentUrl);
  return {
    apiKey: credentials.apiKey,
    azureBaseURL: endpoint.azureBaseURL,
    ...(endpoint.azureApiVersion ? { azureApiVersion: endpoint.azureApiVersion } : {}),
    ...(credentials.azureDeploymentName
      ? { azureDeploymentName: credentials.azureDeploymentName }
      : {}),
  };
}

export function parseAzureOpenAIDeploymentUrl(deploymentUrl: string): {
  azureBaseURL: string;
  azureApiVersion?: string;
} {
  let url: URL;
  try {
    url = new URL(deploymentUrl);
  } catch {
    throw new GatewayProxyError(
      'Azure OpenAI deployment URL must be a valid URL.',
      'invalid_provider_config',
      400
    );
  }

  const apiVersion = url.searchParams.get('api-version')?.trim() || undefined;
  let pathname = url.pathname.replace(/\/+$/u, '');
  if (pathname.endsWith('/responses')) {
    pathname = pathname.slice(0, -'/responses'.length);
  }

  if (!pathname || !pathname.includes('/openai')) {
    throw new GatewayProxyError(
      'Azure OpenAI deployment URL must include an /openai path.',
      'invalid_provider_config',
      400
    );
  }

  return {
    azureBaseURL: `${url.origin}${pathname}`,
    ...(apiVersion ? { azureApiVersion: apiVersion } : {}),
  };
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

function mapStopReasonToStatus(
  stopReason: BaseAssistantMessage<Api>['stopReason']
): 'aborted' | 'error' | 'ok' {
  if (stopReason === 'aborted') {
    return 'aborted';
  }

  if (stopReason === 'error') {
    return 'error';
  }

  return 'ok';
}
