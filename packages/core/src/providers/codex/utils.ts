import OpenAI from 'openai';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';
import {
  buildOpenAIMessages,
  convertTools,
  getMockOpenaiMessage,
  mapStopReason,
} from '../openai/utils.js';

import type { CodexProviderOptions, Context, Model } from '../../types/index.js';
import type {
  Tool as OpenAITool,
  Response as OpenAIResponse,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses.js';

const CODEX_ORIGINATOR = 'codex_cli_rs';
const CODEX_USER_AGENT = 'codex_cli_rs/0.98.0 (Mac OS 26.3.0; arm64)';
const DEFAULT_CODEX_INSTRUCTIONS = 'You are a helpful assistant';

interface CodexBackendErrorBody {
  detail?: unknown;
  error?: Record<string, unknown>;
  message?: unknown;
}

/**
 * Rewrites ChatGPT backend error payloads into OpenAI API error shape
 * so the SDK can parse and expose message/code fields correctly.
 */
export function rewriteCodexErrorBody(body: string, status: number): string {
  let detail = body;
  let type = 'codex_backend_error';
  let code = String(status);
  let extra: Record<string, unknown> = {};

  try {
    const json = JSON.parse(body) as CodexBackendErrorBody;
    if (json.error && typeof json.error === 'object') {
      extra = { ...json.error };
      if (typeof json.error.message === 'string' && json.error.message.length > 0) {
        detail = json.error.message;
      } else {
        detail = JSON.stringify(json.error);
      }
      if (typeof json.error.type === 'string' && json.error.type.length > 0) {
        type = json.error.type;
      }
      if (
        (typeof json.error.code === 'string' && json.error.code.length > 0) ||
        typeof json.error.code === 'number'
      ) {
        code = String(json.error.code);
      }
    } else if (typeof json.message === 'string' && json.message.length > 0) {
      detail = json.message;
    }
    if (typeof json.detail === 'string' && json.detail.length > 0) {
      detail = json.detail;
    }
  } catch {
    // Keep raw body when backend doesn't return valid JSON.
  }

  return JSON.stringify({
    error: {
      ...extra,
      message: detail,
      type,
      code,
    },
  });
}

async function codexFetch(
  url: string | URL | Request,
  init?: RequestInit
): Promise<globalThis.Response> {
  const response = await globalThis.fetch(url, init);
  if (response.ok) {
    return response;
  }

  const body = await response.text();
  const rewritten = rewriteCodexErrorBody(body, response.status);
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');

  return new globalThis.Response(rewritten, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createClient(model: Model<'codex'>, options: CodexProviderOptions) {
  if (!options.apiKey) {
    throw new Error('Codex API key is required.');
  }
  if (!options['chatgpt-account-id']) {
    throw new Error('Codex chatgpt-account-id is required.');
  }

  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      ...(model.headers || {}),
      'chatgpt-account-id': options['chatgpt-account-id'],
      originator: CODEX_ORIGINATOR,
      'x-oai-web-search-eligible': 'true',
      'user-agent': CODEX_USER_AGENT,
    },
    fetch: codexFetch,
  });
}

export function buildParams(
  model: Model<'codex'>,
  context: Context,
  options: CodexProviderOptions
) {
  const messages = buildCodexMessages(model, context);
  const resolvedInstructions =
    context.systemPrompt?.trim() && context.systemPrompt.trim().length > 0
      ? context.systemPrompt
      : options.instructions?.trim() && options.instructions.trim().length > 0
        ? options.instructions
        : DEFAULT_CODEX_INSTRUCTIONS;

  const {
    apiKey,
    signal,
    'chatgpt-account-id': chatgptAccountId,
    temperature,
    top_p,
    truncation,
    max_output_tokens,
    stream,
    store,
    ...codexOptions
  } = options;

  void apiKey;
  void signal;
  void chatgptAccountId;
  void temperature;
  void top_p;
  void truncation;
  void max_output_tokens;
  void stream;
  void store;

  const params: ResponseCreateParamsNonStreaming = {
    ...codexOptions,
    model: model.id,
    instructions: sanitizeSurrogates(resolvedInstructions),
    input: messages,
    store: false,
    stream: false,
  };

  const tools: OpenAITool[] = [];

  if (context.tools && model.tools.includes('function_calling')) {
    const convertedTools = convertTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }
  }

  if (codexOptions.tools) {
    for (const optionTool of codexOptions.tools) {
      tools.push(optionTool);
    }
  }

  params.tools = tools;
  return params;
}

export function buildCodexMessages(model: Model<'codex'>, context: Context) {
  const { systemPrompt, ...contextWithoutSystemPrompt } = context;
  void systemPrompt;
  return buildOpenAIMessages(model as unknown as Model<'openai'>, contextWithoutSystemPrompt);
}

export { convertTools, mapStopReason };

export function getMockCodexMessage(modelId: string, requestId: string): OpenAIResponse {
  return getMockOpenaiMessage(modelId, requestId);
}
