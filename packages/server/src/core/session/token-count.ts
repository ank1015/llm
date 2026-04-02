import { getText, getToolCalls } from '@ank1015/llm-sdk';

import type { Content, Message } from '@ank1015/llm-sdk';

const APPROX_CHARS_PER_TOKEN = 4;

export function estimateMessagesTokenCount(messages: Message[]): number {
  let totalChars = 0;

  for (const message of messages) {
    switch (message.role) {
      case 'user':
        totalChars += getTextContentLength(message.content);
        break;
      case 'assistant':
        totalChars += getText(message).length;
        totalChars += getAssistantToolCallsLength(message);
        break;
      case 'toolResult':
        totalChars += getTextContentLength(message.content);
        totalChars += message.error?.message.length ?? 0;
        break;
      default:
        break;
    }
  }

  return estimateTextTokenCount(totalChars);
}

export function estimateTextTokenCount(textOrCharCount: string | number): number {
  const charCount =
    typeof textOrCharCount === 'number' ? Math.max(0, textOrCharCount) : textOrCharCount.length;

  if (charCount === 0) {
    return 0;
  }

  return Math.ceil(charCount / APPROX_CHARS_PER_TOKEN);
}

function getAssistantToolCallsLength(message: Extract<Message, { role: 'assistant' }>): number {
  let totalChars = 0;

  for (const toolCall of getToolCalls(message)) {
    totalChars += toolCall.name.length;
    totalChars += JSON.stringify(toolCall.arguments).length;
  }

  return totalChars;
}

function getTextContentLength(content: Content): number {
  let totalChars = 0;

  for (const item of content) {
    if (item.type === 'text') {
      totalChars += item.content.length;
    }
  }

  return totalChars;
}
