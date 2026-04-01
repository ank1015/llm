import { randomUUID } from 'node:crypto';

import type { AssistantToolCall, Content, ToolResultMessage, UserMessage } from '@ank1015/llm-core';

export interface UserMessageOptions {
  id?: string;
  timestamp?: number;
}

export interface ToolResultMessageOptions<TDetails = unknown> {
  toolCall: AssistantToolCall;
  content: Content;
  details?: TDetails;
  isError?: boolean;
  error?: ToolResultMessage<TDetails>['error'];
  id?: string;
  timestamp?: number;
}

export function userMessage(content: string | Content, options: UserMessageOptions = {}): UserMessage {
  return {
    role: 'user',
    id: options.id ?? randomUUID(),
    ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
    content:
      typeof content === 'string'
        ? [{ type: 'text', content }]
        : content,
  };
}

export function toolResultMessage<TDetails = unknown>(
  options: ToolResultMessageOptions<TDetails>
): ToolResultMessage<TDetails> {
  const isError = options.isError ?? options.error !== undefined;

  return {
    role: 'toolResult',
    id: options.id ?? randomUUID(),
    toolName: options.toolCall.name,
    toolCallId: options.toolCall.toolCallId,
    content: options.content,
    ...(options.details !== undefined ? { details: options.details } : {}),
    isError,
    ...(options.error !== undefined ? { error: options.error } : {}),
    timestamp: options.timestamp ?? Date.now(),
  };
}
