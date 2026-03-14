import {
  type ContentListUnion,
  FinishReason,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
  type ToolListUnion,
} from '@google/genai';

import { sanitizeSurrogates } from '../../utils/sanitize-unicode.js';

import type {
  BaseAssistantMessage,
  Context,
  GoogleProviderOptions,
  Model,
  StopReason,
  Tool,
} from '@ank1015/llm-types';
import type { TSchema } from '@sinclair/typebox';

export function createClient(model: Model<'google'>, apiKey: string): GoogleGenAI {
  if (!apiKey) {
    throw new Error('Google API key is required.');
  }
  if (model.headers) {
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: model.headers },
    });
  }
  return new GoogleGenAI({ apiKey });
}

export function buildParams(
  model: Model<'google'>,
  context: Context,
  options: GoogleProviderOptions
) {
  const contents = buildGoogleMessages(model, context);

  const { apiKey, signal, ...googleOptions } = options;

  const config: GenerateContentConfig = {
    ...googleOptions,
  };

  if (options?.signal) {
    config.abortSignal = options.signal;
  }

  if (context.systemPrompt) {
    config.systemInstruction = sanitizeSurrogates(context.systemPrompt);
  }

  const tools: ToolListUnion = [];

  if (context.tools && model.tools.includes('function_calling')) {
    const convertedTools = convertTools(context.tools);
    for (const convertedTool of convertedTools) {
      tools.push(convertedTool);
    }
  }

  if (googleOptions.tools) {
    for (const optionTool of googleOptions.tools) {
      tools.push(optionTool);
    }
  }

  if (tools.length > 0) config.tools = tools;

  const params: GenerateContentParameters = {
    model: model.id,
    contents,
    config,
  };

  return params;
}

export function buildGoogleMessages(model: Model<'google'>, context: Context): ContentListUnion {
  const contents: ContentListUnion = [];

  for (const message of context.messages) {
    if (message.role === 'user') {
      const parts: Part[] = [];
      for (const messageContent of message.content) {
        if (messageContent.type === 'text') {
          parts.push({
            text: sanitizeSurrogates(messageContent.content),
          });
        } else if (messageContent.type === 'image' && model.input.includes('image')) {
          parts.push({
            inlineData: {
              mimeType: messageContent.mimeType,
              data: messageContent.data,
            },
          });
        } else if (messageContent.type === 'file' && model.input.includes('file')) {
          parts.push({
            inlineData: {
              mimeType: messageContent.mimeType,
              data: messageContent.data,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({
          role: 'user',
          parts,
        });
      }
    }

    if (message.role === 'toolResult') {
      const parts: Part[] = [];
      const textParts: string[] = [];
      for (const messageContent of message.content) {
        if (messageContent.type === 'text') {
          textParts.push(messageContent.content);
        } else if (messageContent.type === 'image' && model.input.includes('image')) {
          parts.push({
            inlineData: {
              mimeType: messageContent.mimeType,
              data: messageContent.data,
            },
          });
        } else if (messageContent.type === 'file' && model.input.includes('file')) {
          parts.push({
            inlineData: {
              mimeType: messageContent.mimeType,
              data: messageContent.data,
            },
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: message.toolCallId,
              name: message.toolName,
              parts,
              response: {
                result: sanitizeSurrogates(
                  textParts.length > 0 ? textParts.join('\n') : '(see attached:)'
                ),
                isError: message.isError,
              },
            },
          },
        ],
      });
    }

    if (message.role === 'assistant') {
      if (message.model.api === 'google') {
        const baseMessage = message as BaseAssistantMessage<'google'>;
        if (baseMessage.message.candidates) {
          for (const candidate of baseMessage.message.candidates) {
            if (candidate.content) {
              contents.push(candidate.content);
            }
          }
        }
      }
      // Convert from other providers using the normalized content field
      else {
        const parts: Part[] = [];

        for (const contentBlock of message.content) {
          if (contentBlock.type === 'thinking') {
            // Wrap thinking in <thinking> tags for cross-provider context
            parts.push({
              text: `<thinking>${sanitizeSurrogates(contentBlock.thinkingText)}</thinking>`,
            });
          } else if (contentBlock.type === 'response') {
            for (const responseItem of contentBlock.content) {
              if (responseItem.type === 'text') {
                if (responseItem.content) {
                  parts.push({
                    text: sanitizeSurrogates(responseItem.content),
                  });
                }
              } else if (responseItem.type === 'image' && model.input.includes('image')) {
                parts.push({
                  inlineData: {
                    mimeType: responseItem.mimeType,
                    data: responseItem.data,
                  },
                });
              } else if (responseItem.type === 'file' && model.input.includes('file')) {
                parts.push({
                  inlineData: {
                    mimeType: responseItem.mimeType,
                    data: responseItem.data,
                  },
                });
              }
            }
          } else if (contentBlock.type === 'toolCall') {
            // Convert tool call to Google's functionCall format
            parts.push({
              functionCall: {
                id: contentBlock.toolCallId,
                name: contentBlock.name,
                args: contentBlock.arguments,
              },
              thoughtSignature: 'skip_thought_signature_validator',
            });
          }
        }

        if (parts.length > 0) {
          contents.push({
            role: 'model',
            parts,
          });
        }
      }
    }
  }
  return contents;
}

/**
 * JSON Schema type that can be primitives, objects, or arrays
 * Covers the recursive nature of JSON Schema structures
 */
type JSONSchemaValue =
  | TSchema
  | { [key: string]: JSONSchemaValue }
  | JSONSchemaValue[]
  | string
  | number
  | boolean
  | null;

/**
 * Transforms a JSON Schema to Google's supported subset.
 * Main transformations:
 * - Converts { "const": "value" } to { "enum": ["value"] }
 * - Converts { "anyOf": [{ "const": "a" }, { "const": "b" }] } to { "enum": ["a", "b"] }
 * - Recursively processes nested objects and arrays
 */
export function transformSchemaForGoogle(schema: JSONSchemaValue): JSONSchemaValue {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Handle arrays
  if (Array.isArray(schema)) {
    return schema.map(transformSchemaForGoogle);
  }

  const transformed: Record<string, JSONSchemaValue> = {};

  // Handle const keyword - convert to enum
  if ('const' in schema) {
    transformed.enum = [schema.const];
    // Copy over other properties except const
    for (const key in schema) {
      if (key !== 'const') {
        transformed[key] = schema[key];
      }
    }
    return transformed;
  }

  // Handle anyOf with const values - convert to enum
  if ('anyOf' in schema && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const allConst = schema.anyOf.every(
      (item: JSONSchemaValue) =>
        item && typeof item === 'object' && !Array.isArray(item) && 'const' in item
    );
    if (allConst) {
      // Extract all const values into a single enum
      transformed.enum = schema.anyOf.map((item: JSONSchemaValue) => {
        if (item && typeof item === 'object' && !Array.isArray(item) && 'const' in item) {
          return item.const;
        }
        return item;
      });
      // Copy over other properties from the parent schema
      for (const key in schema) {
        if (key !== 'anyOf') {
          transformed[key] = schema[key];
        }
      }
      // Copy type and other properties from the first anyOf item if not already set
      if (schema.anyOf.length > 0) {
        const firstItem = schema.anyOf[0];
        if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
          for (const key in firstItem) {
            if (key !== 'const' && !(key in transformed)) {
              transformed[key] = firstItem[key];
            }
          }
        }
      }
      return transformed;
    }
  }

  // Recursively process all properties
  for (const key in schema) {
    if (key === 'properties' && typeof schema.properties === 'object') {
      // Recursively transform each property
      transformed.properties = {};
      for (const propKey in schema.properties) {
        transformed.properties[propKey] = transformSchemaForGoogle(schema.properties[propKey]);
      }
    } else if (key === 'items' && schema.items) {
      // Recursively transform array items schema
      transformed.items = transformSchemaForGoogle(schema.items);
    } else if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      // Recursively transform union/intersection schemas
      transformed[key] = Array.isArray(schema[key])
        ? schema[key].map(transformSchemaForGoogle)
        : transformSchemaForGoogle(schema[key]);
    } else {
      // Copy other properties as-is
      transformed[key] = schema[key];
    }
  }

  return transformed;
}

export function convertTools(tools: readonly Tool[]): ToolListUnion {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: transformSchemaForGoogle(tool.parameters) as Record<string, unknown>,
      })),
    },
  ];
}

export function mapStopReason(reason: FinishReason): StopReason {
  switch (reason) {
    case FinishReason.STOP:
      return 'stop';
    case FinishReason.MAX_TOKENS:
      return 'length';
    case FinishReason.BLOCKLIST:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.SPII:
    case FinishReason.SAFETY:
    case FinishReason.IMAGE_SAFETY:
    case FinishReason.IMAGE_PROHIBITED_CONTENT:
    case FinishReason.RECITATION:
    case FinishReason.FINISH_REASON_UNSPECIFIED:
    case FinishReason.OTHER:
    case FinishReason.LANGUAGE:
    case FinishReason.MALFORMED_FUNCTION_CALL:
    case FinishReason.UNEXPECTED_TOOL_CALL:
    case FinishReason.NO_IMAGE:
    case FinishReason.IMAGE_RECITATION:
    case FinishReason.IMAGE_OTHER:
      return 'error';
    default: {
      const _exhaustive: never = reason;
      throw new Error(`Unhandled stop reason: ${_exhaustive}`);
    }
  }
}

export function getMockGoogleMessage(): GenerateContentResponse {
  return {
    text: '',
    data: '',
    functionCalls: [],
    executableCode: '',
    codeExecutionResult: '',
  };
}
