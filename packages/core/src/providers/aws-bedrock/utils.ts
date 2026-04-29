import {
  BedrockRuntimeClient,
  CachePointType,
  CacheTTL,
  ConversationRole,
  DocumentFormat,
  ImageFormat,
  StopReason as BedrockStopReason,
  ToolResultStatus,
} from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-providers';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';

import type {
  Api,
  AwsBedrockNativeResponse,
  AwsBedrockProviderOptions,
  BaseAssistantMessage,
  Content,
  Context,
  FileContent,
  Model,
  StopReason,
  TextContent,
  Tool,
  ToolResultMessage,
} from '../../types/index.js';
import type {
  BedrockRuntimeClientConfig,
  ContentBlock,
  ConverseStreamCommandInput,
  Message as BedrockMessage,
  SystemContentBlock,
  Tool as BedrockTool,
  ToolChoice,
  ToolConfiguration,
  ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

export type BedrockNativeContentBlock = ContentBlock & {
  index?: number;
  partialJson?: string;
};

type AwsBedrockAssistantMessage = BaseAssistantMessage<'aws-bedrock'>;
type AnyAssistantMessage = BaseAssistantMessage<Api>;

export function createClient(options: AwsBedrockProviderOptions): BedrockRuntimeClient {
  if (!options.region?.trim()) {
    throw new Error('AWS Bedrock region is required.');
  }

  const config: BedrockRuntimeClientConfig = {
    region: options.region,
  };

  if (options.credentials) {
    config.credentials = options.credentials;
  } else if (options.profile) {
    config.credentials = fromIni({ profile: options.profile });
  } else if (options.bearerToken) {
    config.credentials = {
      accessKeyId: 'bearer-token-auth',
      secretAccessKey: 'bearer-token-auth',
    };
  }

  if (options.profile) {
    config.profile = options.profile;
  }

  if (options.endpoint) {
    config.endpoint = options.endpoint;
  }

  const client = new BedrockRuntimeClient(config);
  if (options.bearerToken) {
    addBearerTokenMiddleware(client, options.bearerToken);
  }
  return client;
}

function addBearerTokenMiddleware(client: BedrockRuntimeClient, bearerToken: string): void {
  client.middlewareStack.addRelativeTo(
    (next: any) => async (args: any) => {
      const request = args.request;
      if (
        typeof request === 'object' &&
        request !== null &&
        'headers' in request &&
        typeof request.headers === 'object' &&
        request.headers !== null
      ) {
        const headers = request.headers as Record<string, string>;
        deleteHeader(headers, 'authorization');
        deleteHeader(headers, 'x-amz-date');
        deleteHeader(headers, 'x-amz-security-token');
        deleteHeader(headers, 'x-amz-content-sha256');
        headers.authorization = `Bearer ${bearerToken}`;
      }
      return next(args);
    },
    {
      relation: 'after',
      toMiddleware: 'awsAuthMiddleware',
      name: 'awsBedrockBearerTokenAuth',
    }
  );
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  for (const headerName of Object.keys(headers)) {
    if (headerName.toLowerCase() === name) {
      delete headers[headerName];
    }
  }
}

export function buildCommandInput(
  model: Model<'aws-bedrock'>,
  context: Context,
  options: AwsBedrockProviderOptions
): ConverseStreamCommandInput {
  const {
    signal,
    region,
    credentials,
    profile,
    endpoint,
    bearerToken,
    toolChoice,
    reasoning,
    thinkingBudgetTokens,
    thinkingDisplay,
    cacheRetention,
    toolConfig,
    ...bedrockOptions
  } = options;
  void signal;
  void region;
  void credentials;
  void profile;
  void endpoint;
  void bearerToken;
  void toolChoice;
  void reasoning;
  void thinkingBudgetTokens;
  void thinkingDisplay;
  void cacheRetention;

  const resolvedCacheRetention = cacheRetention ?? 'short';
  const commandInput: ConverseStreamCommandInput = {
    ...bedrockOptions,
    modelId: model.id,
    messages: buildBedrockMessages(model, context, resolvedCacheRetention),
    system: buildSystemPrompt(context.systemPrompt, model, resolvedCacheRetention),
  };

  const resolvedToolConfig = buildToolConfig(context.tools, toolChoice, toolConfig);
  if (resolvedToolConfig) {
    commandInput.toolConfig = resolvedToolConfig;
  }

  const additionalModelRequestFields = buildAdditionalModelRequestFields(model, options);
  if (additionalModelRequestFields) {
    commandInput.additionalModelRequestFields = {
      ...(isRecord(bedrockOptions.additionalModelRequestFields)
        ? bedrockOptions.additionalModelRequestFields
        : {}),
      ...additionalModelRequestFields,
    } as ConverseStreamCommandInput['additionalModelRequestFields'];
  }

  return commandInput;
}

export function getMockAwsBedrockMessage(
  modelId: string,
  _requestId: string
): AwsBedrockNativeResponse {
  return {
    modelId,
    content: [],
  };
}

function buildSystemPrompt(
  systemPrompt: string | undefined,
  model: Model<'aws-bedrock'>,
  cacheRetention: AwsBedrockProviderOptions['cacheRetention']
): SystemContentBlock[] | undefined {
  if (!systemPrompt) return undefined;

  const blocks: SystemContentBlock[] = [{ text: sanitizeSurrogates(systemPrompt) }];
  addCachePoint(blocks, model, cacheRetention);
  return blocks;
}

export function buildBedrockMessages(
  model: Model<'aws-bedrock'>,
  context: Context,
  cacheRetention: AwsBedrockProviderOptions['cacheRetention'] = 'short'
): BedrockMessage[] {
  const messages: BedrockMessage[] = [];

  for (let index = 0; index < context.messages.length; index++) {
    const message = context.messages[index];
    if (!message) continue;

    if (message.role === 'user') {
      const content = buildUserContent(model, message.content);
      if (content.length > 0) {
        messages.push({ role: ConversationRole.USER, content });
      }
      continue;
    }

    if (message.role === 'assistant') {
      const content = buildAssistantContent(message, model);
      if (content.length > 0) {
        messages.push({ role: ConversationRole.ASSISTANT, content });
      }
      continue;
    }

    if (message.role === 'toolResult') {
      const toolResults = collectToolResults(model, context.messages, index);
      if (toolResults.content.length > 0) {
        messages.push({ role: ConversationRole.USER, content: toolResults.content });
      }
      index = toolResults.nextIndex - 1;
    }
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === ConversationRole.USER && lastMessage.content) {
    addCachePoint(lastMessage.content, model, cacheRetention);
  }

  return messages;
}

function buildUserContent(model: Model<'aws-bedrock'>, content: Content): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let hasText = false;

  for (const item of content) {
    if (item.type === 'text') {
      blocks.push({ text: sanitizeSurrogates(item.content) });
      hasText = true;
    } else if (item.type === 'image' && model.input.includes('image')) {
      blocks.push({ image: createImageBlock(item.mimeType, item.data) });
    } else if (item.type === 'file' && model.input.includes('file')) {
      const document = createDocumentBlock(item);
      if (document) {
        blocks.push({ document });
      }
    }
  }

  if (!hasText && blocks.some((block) => block.document)) {
    blocks.unshift({ text: 'Please use the attached document.' });
  }

  return blocks;
}

function buildAssistantContent(
  message: AwsBedrockAssistantMessage | AnyAssistantMessage,
  model: Model<'aws-bedrock'>
): ContentBlock[] {
  if (message.model.api === 'aws-bedrock') {
    const bedrockMessage = message as AwsBedrockAssistantMessage;
    if (bedrockMessage.message.content.length > 0) {
      return bedrockMessage.message.content;
    }
  }

  const blocks: ContentBlock[] = [];
  for (const block of message.content) {
    if (block.type === 'response') {
      const text = block.response
        .filter((content): content is TextContent => content.type === 'text')
        .map((content) => sanitizeSurrogates(content.content))
        .join('');
      if (text) {
        blocks.push({ text });
      }
    } else if (block.type === 'thinking' && block.thinkingText.trim()) {
      blocks.push({ text: `<thinking>${sanitizeSurrogates(block.thinkingText)}</thinking>` });
    } else if (block.type === 'toolCall' && model.tools.includes('function_calling')) {
      blocks.push({
        toolUse: {
          toolUseId: block.toolCallId,
          name: block.name,
          input: block.arguments as ContentBlock.ToolUseMember['toolUse']['input'],
        },
      });
    }
  }
  return blocks;
}

function collectToolResults(
  model: Model<'aws-bedrock'>,
  messages: Context['messages'],
  startIndex: number
): { content: ContentBlock[]; nextIndex: number } {
  const content: ContentBlock[] = [];
  let index = startIndex;

  while (index < messages.length && messages[index]?.role === 'toolResult') {
    const message = messages[index];
    if (message?.role !== 'toolResult') break;
    content.push({
      toolResult: {
        toolUseId: normalizeToolCallId(message.toolCallId),
        content: buildToolResultContent(model, message),
        status: message.isError ? ToolResultStatus.ERROR : ToolResultStatus.SUCCESS,
      },
    });
    index++;
  }

  return { content, nextIndex: index };
}

function buildToolResultContent(
  model: Model<'aws-bedrock'>,
  message: ToolResultMessage
): ToolResultContentBlock[] {
  const content: ToolResultContentBlock[] = [];

  for (const item of message.content) {
    if (item.type === 'text') {
      content.push({
        text: sanitizeSurrogates(message.isError ? `[TOOL ERROR] ${item.content}` : item.content),
      });
    } else if (item.type === 'image' && model.input.includes('image')) {
      content.push({ image: createImageBlock(item.mimeType, item.data) });
    } else if (item.type === 'file' && model.input.includes('file')) {
      const document = createDocumentBlock(item);
      if (document) {
        content.push({ document });
      }
    }
  }

  if (content.length === 0) {
    content.push({ text: sanitizeSurrogates(message.isError ? '[TOOL ERROR]' : '') });
  }

  return content;
}

export function buildToolConfig(
  tools: Tool[] | undefined,
  toolChoice: AwsBedrockProviderOptions['toolChoice'],
  optionToolConfig?: ToolConfiguration
): ToolConfiguration | undefined {
  if ((!tools || tools.length === 0) && !optionToolConfig) return undefined;
  if (toolChoice === 'none') return undefined;

  const convertedTools: BedrockTool[] =
    tools?.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: { json: tool.parameters },
      },
    })) ?? [];

  const mergedTools = [...convertedTools, ...(optionToolConfig?.tools ?? [])];
  if (mergedTools.length === 0) return undefined;

  return {
    ...optionToolConfig,
    tools: mergedTools,
    toolChoice: resolveToolChoice(toolChoice) ?? optionToolConfig?.toolChoice,
  };
}

function resolveToolChoice(
  toolChoice: AwsBedrockProviderOptions['toolChoice']
): ToolChoice | undefined {
  if (toolChoice === 'auto') return { auto: {} };
  if (toolChoice === 'any') return { any: {} };
  if (toolChoice && typeof toolChoice === 'object') {
    return { tool: { name: toolChoice.name } };
  }
  return undefined;
}

function buildAdditionalModelRequestFields(
  model: Model<'aws-bedrock'>,
  options: AwsBedrockProviderOptions
): Record<string, unknown> | undefined {
  if (!options.reasoning || !model.reasoning || !isAnthropicClaudeModel(model.id)) {
    return undefined;
  }

  const display = options.thinkingDisplay ?? 'summarized';
  if (supportsAdaptiveThinking(model.id)) {
    return {
      thinking: { type: 'adaptive', display },
      output_config: { effort: mapReasoningEffort(options.reasoning, model.id) },
    };
  }

  return {
    thinking: {
      type: 'enabled',
      budget_tokens: options.thinkingBudgetTokens ?? defaultThinkingBudget(options.reasoning),
      display,
    },
  };
}

function defaultThinkingBudget(
  reasoning: NonNullable<AwsBedrockProviderOptions['reasoning']>
): number {
  switch (reasoning) {
    case 'minimal':
    case 'low':
      return 2048;
    case 'medium':
      return 8192;
    case 'high':
    case 'xhigh':
      return 16384;
  }
}

function mapReasoningEffort(
  reasoning: NonNullable<AwsBedrockProviderOptions['reasoning']>,
  modelId: string
): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  if (reasoning === 'minimal' || reasoning === 'low') return 'low';
  if (reasoning === 'medium') return 'medium';
  if (reasoning === 'xhigh' && modelId.includes('opus-4-6')) return 'max';
  if (reasoning === 'xhigh') return 'xhigh';
  return 'high';
}

function supportsAdaptiveThinking(modelId: string): boolean {
  return (
    modelId.includes('opus-4-6') ||
    modelId.includes('opus-4.6') ||
    modelId.includes('sonnet-4-6') ||
    modelId.includes('sonnet-4.6')
  );
}

function supportsPromptCaching(model: Model<'aws-bedrock'>): boolean {
  const id = model.id.toLowerCase();
  return (
    id.includes('claude') &&
    (id.includes('-4-') ||
      id.includes('-4.') ||
      id.includes('claude-3-7-sonnet') ||
      id.includes('claude-3-5-haiku'))
  );
}

function isAnthropicClaudeModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return id.includes('anthropic.claude') || id.includes('anthropic/claude');
}

function addCachePoint(
  blocks: (SystemContentBlock | ContentBlock)[],
  model: Model<'aws-bedrock'>,
  cacheRetention: AwsBedrockProviderOptions['cacheRetention']
): void {
  if (cacheRetention === 'none' || !supportsPromptCaching(model)) return;

  blocks.push({
    cachePoint: {
      type: CachePointType.DEFAULT,
      ...(cacheRetention === 'long' ? { ttl: CacheTTL.ONE_HOUR } : {}),
    },
  });
}

function createImageBlock(mimeType: string, data: string) {
  return {
    format: resolveImageFormat(mimeType),
    source: { bytes: base64ToUint8Array(data) },
  };
}

function createDocumentBlock(file: FileContent) {
  const format = resolveDocumentFormat(file.mimeType, file.filename);
  if (!format) return null;

  return {
    format,
    name: normalizeDocumentName(file.filename),
    source: { bytes: base64ToUint8Array(file.data) },
  };
}

function resolveImageFormat(mimeType: string): ImageFormat {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return ImageFormat.JPEG;
    case 'image/png':
      return ImageFormat.PNG;
    case 'image/gif':
      return ImageFormat.GIF;
    case 'image/webp':
      return ImageFormat.WEBP;
    default:
      throw new Error(`Unknown image type: ${mimeType}`);
  }
}

function resolveDocumentFormat(mimeType: string, filename: string): DocumentFormat | null {
  if (mimeType === 'application/pdf') return DocumentFormat.PDF;
  if (mimeType === 'text/plain') return DocumentFormat.TXT;
  if (mimeType === 'text/markdown') return DocumentFormat.MD;
  if (mimeType === 'text/csv') return DocumentFormat.CSV;
  if (mimeType === 'text/html') return DocumentFormat.HTML;

  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return DocumentFormat.PDF;
    case 'txt':
      return DocumentFormat.TXT;
    case 'md':
      return DocumentFormat.MD;
    case 'csv':
      return DocumentFormat.CSV;
    case 'html':
    case 'htm':
      return DocumentFormat.HTML;
    case 'doc':
      return DocumentFormat.DOC;
    case 'docx':
      return DocumentFormat.DOCX;
    case 'xls':
      return DocumentFormat.XLS;
    case 'xlsx':
      return DocumentFormat.XLSX;
    default:
      return null;
  }
}

function normalizeDocumentName(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/u, '');
  const normalized = withoutExtension
    .replace(/[^a-zA-Z0-9\s()[\]-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.slice(0, 128) || 'document';
}

function base64ToUint8Array(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mapStopReason(reason: string | undefined): StopReason {
  switch (reason) {
    case BedrockStopReason.END_TURN:
    case BedrockStopReason.STOP_SEQUENCE:
      return 'stop';
    case BedrockStopReason.MAX_TOKENS:
    case BedrockStopReason.MODEL_CONTEXT_WINDOW_EXCEEDED:
      return 'length';
    case BedrockStopReason.TOOL_USE:
      return 'toolUse';
    default:
      return 'error';
  }
}

export function normalizeToolCallId(id: string): string {
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/gu, '_');
  return sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
}
