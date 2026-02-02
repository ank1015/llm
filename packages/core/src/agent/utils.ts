import { generateUUID } from '../utils/uuid.js';

import type {
  AgentToolResult,
  AssistantToolCall,
  Attachment,
  Content,
  ToolResultMessage,
  UserMessage,
} from '@ank1015/llm-types';

/**
 * Builds a UserMessage from text input and optional attachments.
 * Pure function with no side effects.
 */
export function buildUserMessage(input: string, attachments?: Attachment[]): UserMessage {
  const content: Content = [{ type: 'text', content: input }];

  if (attachments?.length) {
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        content.push({
          type: 'image',
          data: attachment.content,
          mimeType: attachment.mimeType,
          metadata: {
            fileName: attachment.fileName,
            size: attachment.size || 0,
          },
        });
      }
      if (attachment.type === 'file') {
        content.push({
          type: 'file',
          data: attachment.content,
          mimeType: attachment.mimeType,
          filename: attachment.fileName,
          metadata: {
            fileName: attachment.fileName,
            size: attachment.size || 0,
          },
        });
      }
    }
  }

  return {
    role: 'user',
    id: generateUUID(),
    timestamp: Date.now(),
    content,
  };
}

/**
 * Builds a ToolResultMessage from tool execution results.
 * Pure function with no side effects.
 */
export function buildToolResultMessage(
  toolCall: AssistantToolCall,
  result: AgentToolResult<unknown>,
  isError: boolean,
  errorDetails?: ToolResultMessage['error']
): ToolResultMessage {
  const message: ToolResultMessage = {
    role: 'toolResult',
    id: generateUUID(),
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.name,
    content: result.content,
    details: result.details,
    isError,
    timestamp: Date.now(),
  };
  if (errorDetails) {
    message.error = errorDetails;
  }
  return message;
}
