import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { getSdkConfig } from './config.js';

import type {
  AgentModelInvoker,
  AgentModelInvocation,
  Api,
  BaseAssistantEvent,
  BaseAssistantMessage,
  BaseImageResult,
  Context,
  ImageApi,
  ImageGenerationContext,
} from '@ank1015/llm-core';

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export interface GatewayCredentials {
  gatewayBaseUrl: string;
  accessToken: string;
  refreshToken: string;
  savedAt?: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  refreshTokenId?: string;
}

export type GatewayErrorCode =
  | 'gateway_credentials_not_found'
  | 'gateway_credentials_invalid'
  | 'gateway_refresh_failed'
  | 'gateway_request_failed'
  | 'unsupported_gateway_provider';

export class GatewayTransportError extends Error {
  readonly code: GatewayErrorCode;
  readonly status: number | undefined;
  readonly details: unknown;

  constructor(
    code: GatewayErrorCode,
    message: string,
    options: { details?: unknown; status?: number } = {}
  ) {
    super(message);
    this.name = 'GatewayTransportError';
    this.code = code;
    this.status = options.status;
    this.details = options.details;
  }
}

export interface GatewayLlmRequest {
  api: Api;
  modelId: string;
  messages: Context['messages'];
  systemPrompt?: string;
  tools?: Context['tools'];
  providerOptions?: Record<string, unknown>;
  requestId?: string;
  signal?: AbortSignal;
}

export interface GatewayImageRequest {
  api: ImageApi;
  modelId: string;
  context: ImageGenerationContext;
  providerOptions?: Record<string, unknown>;
  requestId?: string;
  signal?: AbortSignal;
}

type RefreshResponse = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  refreshTokenId?: string;
};

type StreamFailure = {
  error: unknown;
};

export class GatewayAssistantEventStream<TApi extends Api = Api>
  implements AsyncIterable<BaseAssistantEvent<TApi>>
{
  private readonly queue: BaseAssistantEvent<TApi>[] = [];
  private readonly waiting: Array<(value: IteratorResult<BaseAssistantEvent<TApi>>) => void> = [];
  private done = false;
  private failure: StreamFailure | undefined;
  private readonly resultPromise: Promise<BaseAssistantMessage<TApi>>;
  private resolveResult!: (result: BaseAssistantMessage<TApi>) => void;
  private rejectResult!: (error: unknown) => void;

  constructor() {
    this.resultPromise = new Promise<BaseAssistantMessage<TApi>>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
    void this.resultPromise.catch(() => undefined);
  }

  push(event: BaseAssistantEvent<TApi>): void {
    if (this.done) {
      return;
    }

    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
      return;
    }

    this.queue.push(event);
  }

  end(result: BaseAssistantMessage<TApi>): void {
    if (this.done) {
      return;
    }

    this.done = true;
    this.resolveResult(result);
    this.flushWaiters();
  }

  fail(error: unknown): void {
    if (this.done) {
      return;
    }

    this.done = true;
    this.failure = { error };
    this.rejectResult(error);
    this.flushWaiters();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<BaseAssistantEvent<TApi>> {
    while (true) {
      const next = await this.takeNextEvent();
      if (next.done) {
        if (this.failure) {
          throw this.failure.error;
        }
        return;
      }

      yield next.value;
    }
  }

  result(): Promise<BaseAssistantMessage<TApi>> {
    return this.resultPromise;
  }

  async drain(): Promise<BaseAssistantMessage<TApi>> {
    for await (const _ of this) {
      // discard
    }

    const message = await this.resultPromise;
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      throw new GatewayTransportError(
        'gateway_request_failed',
        message.error?.message ||
          message.errorMessage ||
          (message.stopReason === 'aborted' ? 'Gateway stream was aborted.' : 'Gateway stream ended with an error.'),
        { details: message }
      );
    }

    return message;
  }

  private takeNextEvent(): Promise<IteratorResult<BaseAssistantEvent<TApi>>> {
    if (this.queue.length > 0) {
      return Promise.resolve({
        value: this.queue.shift()!,
        done: false,
      });
    }

    if (this.done) {
      return Promise.resolve({ done: true, value: undefined! });
    }

    return new Promise<IteratorResult<BaseAssistantEvent<TApi>>>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private flushWaiters(): void {
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ done: true, value: undefined! });
    }
  }
}

export async function readGatewayCredentials(
  filePath: string = getSdkConfig().gatewayCredentialsPath
): Promise<GatewayCredentials> {
  let content: string;

  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      throw new GatewayTransportError(
        'gateway_credentials_not_found',
        `Gateway credentials file not found at ${filePath}.`
      );
    }

    throw error;
  }

  try {
    return parseGatewayCredentials(JSON.parse(content) as unknown, filePath);
  } catch (error) {
    if (error instanceof GatewayTransportError) {
      throw error;
    }

    throw new GatewayTransportError(
      'gateway_credentials_invalid',
      `Gateway credentials file at ${filePath} is not valid JSON.`,
      { details: error }
    );
  }
}

export async function writeGatewayCredentials(
  credentials: GatewayCredentials,
  filePath: string = getSdkConfig().gatewayCredentialsPath
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, filePath);
}

export async function getGatewayAccessCredentials(input: {
  forceRefresh?: boolean;
  path?: string;
} = {}): Promise<GatewayCredentials> {
  const filePath = input.path ?? getSdkConfig().gatewayCredentialsPath;
  const credentials = await readGatewayCredentials(filePath);

  if (
    !input.forceRefresh &&
    credentials.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS
  ) {
    return credentials;
  }

  return refreshGatewayCredentials(credentials, filePath);
}

export function createGatewayLlmStream<TApi extends Api>(
  input: GatewayLlmRequest
): GatewayAssistantEventStream<TApi> {
  const stream = new GatewayAssistantEventStream<TApi>();

  void pumpGatewayLlmStream(input, stream).catch((error: unknown) => {
    stream.fail(error);
  });

  return stream;
}

export const gatewayModelInvoker: AgentModelInvoker = async <TApi extends Api>(
  input: AgentModelInvocation<TApi>
) => {
  const { model, context, options, signal, onUpdate, messageId } = input;
  const assistantStream = createGatewayLlmStream<TApi>({
    api: model.api,
    modelId: model.id,
    messages: context.messages,
    ...(context.systemPrompt !== undefined ? { systemPrompt: context.systemPrompt } : {}),
    ...(context.tools !== undefined ? { tools: context.tools } : {}),
    providerOptions: options as Record<string, unknown>,
    ...(messageId !== undefined ? { requestId: messageId } : {}),
    ...(signal !== undefined ? { signal } : {}),
  });

  for await (const event of assistantStream) {
    onUpdate?.(event);
  }

  return assistantStream.result();
};

export async function runGatewayImageRequest<TApi extends ImageApi>(
  input: GatewayImageRequest
): Promise<BaseImageResult<TApi>> {
  const response = await fetchGatewayWithAuth('/v1/image/generate', {
    body: {
      api: input.api,
      modelId: input.modelId,
      prompt: input.context.prompt,
      ...(input.context.images !== undefined ? { images: input.context.images } : {}),
      ...(input.context.mask !== undefined ? { mask: input.context.mask } : {}),
      ...(input.providerOptions !== undefined ? { providerOptions: input.providerOptions } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    },
    signal: input.signal,
  });

  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || !isRecord(payload['result'])) {
    throw new GatewayTransportError(
      'gateway_request_failed',
      'Gateway image response did not include a result object.'
    );
  }

  return payload['result'] as unknown as BaseImageResult<TApi>;
}

async function pumpGatewayLlmStream<TApi extends Api>(
  input: GatewayLlmRequest,
  stream: GatewayAssistantEventStream<TApi>
): Promise<void> {
  const response = await fetchGatewayWithAuth('/v1/llm/stream', {
    body: {
      api: input.api,
      modelId: input.modelId,
      messages: input.messages,
      ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
      ...(input.tools !== undefined ? { tools: input.tools } : {}),
      ...(input.providerOptions !== undefined ? { providerOptions: input.providerOptions } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    },
    signal: input.signal,
  });

  let finalMessage: BaseAssistantMessage<TApi> | undefined;

  for await (const event of parseSseEvents<TApi>(response)) {
    finalMessage = event.message;
    stream.push(event);
  }

  if (!finalMessage) {
    throw new GatewayTransportError(
      'gateway_request_failed',
      'Gateway stream ended without an assistant message.'
    );
  }

  stream.end(finalMessage);
}

async function fetchGatewayWithAuth(
  path: string,
  input: { body: unknown; signal?: AbortSignal | undefined }
): Promise<Response> {
  const firstCredentials = await getGatewayAccessCredentials();
  const firstResponse = await postGatewayJson(firstCredentials, path, input);

  if (firstResponse.status !== 401) {
    return ensureOkGatewayResponse(firstResponse);
  }

  const refreshedCredentials = await getGatewayAccessCredentials({ forceRefresh: true });
  const secondResponse = await postGatewayJson(refreshedCredentials, path, input);
  return ensureOkGatewayResponse(secondResponse);
}

async function postGatewayJson(
  credentials: GatewayCredentials,
  path: string,
  input: { body: unknown; signal?: AbortSignal | undefined }
): Promise<Response> {
  return fetch(`${normalizeGatewayBaseUrl(credentials.gatewayBaseUrl)}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  });
}

async function ensureOkGatewayResponse(response: Response): Promise<Response> {
  if (response.ok) {
    return response;
  }

  throw new GatewayTransportError(
    'gateway_request_failed',
    await readGatewayErrorMessage(response, 'Gateway request failed.'),
    { status: response.status }
  );
}

async function refreshGatewayCredentials(
  credentials: GatewayCredentials,
  filePath: string
): Promise<GatewayCredentials> {
  if (credentials.refreshTokenExpiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS) {
    throw new GatewayTransportError(
      'gateway_refresh_failed',
      'Gateway refresh token has expired.'
    );
  }

  const response = await fetch(
    `${normalizeGatewayBaseUrl(credentials.gatewayBaseUrl)}/v1/auth/refresh`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: credentials.refreshToken }),
    }
  );

  if (!response.ok) {
    throw new GatewayTransportError(
      'gateway_refresh_failed',
      await readGatewayErrorMessage(response, 'Failed to refresh gateway access token.'),
      { status: response.status }
    );
  }

  const payload = parseRefreshResponse((await response.json()) as unknown);
  const nextCredentials: GatewayCredentials = {
    gatewayBaseUrl: credentials.gatewayBaseUrl,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    accessTokenExpiresAt: payload.accessTokenExpiresAt,
    refreshTokenExpiresAt: payload.refreshTokenExpiresAt,
    ...(payload.refreshTokenId !== undefined ? { refreshTokenId: payload.refreshTokenId } : {}),
    savedAt: new Date().toISOString(),
  };

  await writeGatewayCredentials(nextCredentials, filePath);
  return nextCredentials;
}

async function* parseSseEvents<TApi extends Api>(
  response: Response
): AsyncIterable<BaseAssistantEvent<TApi>> {
  if (!response.body) {
    throw new GatewayTransportError(
      'gateway_request_failed',
      'Gateway stream response did not include a response body.'
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      yield* drainSseBuffer<TApi>(() => buffer, (nextBuffer) => {
        buffer = nextBuffer;
      });
    }
  } finally {
    reader.releaseLock();
  }

  buffer += decoder.decode();
  yield* drainSseBuffer<TApi>(() => buffer, (nextBuffer) => {
    buffer = nextBuffer;
  });
}

function* drainSseBuffer<TApi extends Api>(
  getBuffer: () => string,
  setBuffer: (value: string) => void
): Iterable<BaseAssistantEvent<TApi>> {
  let buffer = getBuffer();
  let frameEnd = findSseFrameEnd(buffer);

  while (frameEnd !== -1) {
    const frame = buffer.slice(0, frameEnd);
    const separatorLength = buffer.startsWith('\r\n\r\n', frameEnd) ? 4 : 2;
    buffer = buffer.slice(frameEnd + separatorLength);
    setBuffer(buffer);

    const event = parseSseFrame<TApi>(frame);
    if (event) {
      yield event;
    }

    frameEnd = findSseFrameEnd(buffer);
  }
}

function findSseFrameEnd(buffer: string): number {
  const lfIndex = buffer.indexOf('\n\n');
  const crlfIndex = buffer.indexOf('\r\n\r\n');

  if (lfIndex === -1) {
    return crlfIndex;
  }

  if (crlfIndex === -1) {
    return lfIndex;
  }

  return Math.min(lfIndex, crlfIndex);
}

function parseSseFrame<TApi extends Api>(frame: string): BaseAssistantEvent<TApi> | undefined {
  const dataLines = frame
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart());

  if (dataLines.length === 0) {
    return undefined;
  }

  return JSON.parse(dataLines.join('\n')) as BaseAssistantEvent<TApi>;
}

function parseGatewayCredentials(value: unknown, filePath: string): GatewayCredentials {
  if (!isRecord(value)) {
    throw invalidGatewayCredentials(filePath);
  }

  const gatewayBaseUrl = readStringField(value, 'gatewayBaseUrl');
  const accessToken = readStringField(value, 'accessToken');
  const refreshToken = readStringField(value, 'refreshToken');
  const accessTokenExpiresAt = readNumberField(value, 'accessTokenExpiresAt');
  const refreshTokenExpiresAt = readNumberField(value, 'refreshTokenExpiresAt');

  if (
    !gatewayBaseUrl ||
    !accessToken ||
    !refreshToken ||
    !accessTokenExpiresAt ||
    !refreshTokenExpiresAt
  ) {
    throw invalidGatewayCredentials(filePath);
  }

  const savedAt = readStringField(value, 'savedAt');
  const refreshTokenId = readStringField(value, 'refreshTokenId');

  return {
    gatewayBaseUrl,
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    ...(refreshTokenId ? { refreshTokenId } : {}),
    ...(savedAt ? { savedAt } : {}),
  };
}

function parseRefreshResponse(value: unknown): RefreshResponse {
  if (!isRecord(value)) {
    throw new GatewayTransportError(
      'gateway_refresh_failed',
      'Gateway refresh response was not an object.'
    );
  }

  const accessToken = readStringField(value, 'accessToken');
  const refreshToken = readStringField(value, 'refreshToken');
  const accessTokenExpiresAt = readNumberField(value, 'accessTokenExpiresAt');
  const refreshTokenExpiresAt = readNumberField(value, 'refreshTokenExpiresAt');

  if (!accessToken || !refreshToken || !accessTokenExpiresAt || !refreshTokenExpiresAt) {
    throw new GatewayTransportError(
      'gateway_refresh_failed',
      'Gateway refresh response was missing token fields.'
    );
  }

  const refreshTokenId = readStringField(value, 'refreshTokenId');

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    ...(refreshTokenId ? { refreshTokenId } : {}),
  };
}

function invalidGatewayCredentials(filePath: string): GatewayTransportError {
  return new GatewayTransportError(
    'gateway_credentials_invalid',
    `Gateway credentials file at ${filePath} is missing required fields.`
  );
}

function readStringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumberField(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeGatewayBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/u, '');
}

async function readGatewayErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload) && typeof payload['error'] === 'string') {
      return payload['error'];
    }
  } catch {
    // Fall through to text/fallback.
  }

  try {
    const text = await response.text();
    return text.trim() || fallback;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeErrorWithCode(
  error: unknown,
  code: string
): error is NodeJS.ErrnoException & { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
