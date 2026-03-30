import type {
  Api,
  AssistantResponse,
  AssistantToolCall,
  BaseAssistantMessage,
  Content,
} from '@ank1015/llm-core';

export type AssistantResponseInput<TApi extends Api = Api> =
  | BaseAssistantMessage<TApi>
  | AssistantResponse
  | null
  | undefined;

export function getText<TApi extends Api>(input: AssistantResponseInput<TApi>): string {
  let text = '';

  for (const item of getAssistantResponse(input)) {
    if (item.type !== 'response') {
      continue;
    }

    text += getTextFromContent(item.response);
  }

  return text;
}

export function getThinking<TApi extends Api>(input: AssistantResponseInput<TApi>): string {
  const parts: string[] = [];

  for (const item of getAssistantResponse(input)) {
    if (item.type === 'thinking' && item.thinkingText) {
      parts.push(item.thinkingText);
    }
  }

  return parts.join('\n\n');
}

export function getToolCalls<TApi extends Api>(
  input: AssistantResponseInput<TApi>
): AssistantToolCall[] {
  const toolCalls: AssistantToolCall[] = [];

  for (const item of getAssistantResponse(input)) {
    if (item.type === 'toolCall') {
      toolCalls.push(item);
    }
  }

  return toolCalls;
}

function getAssistantResponse<TApi extends Api>(input: AssistantResponseInput<TApi>): AssistantResponse {
  if (!input) {
    return [];
  }

  return Array.isArray(input) ? input : input.content;
}

function getTextFromContent(content: Content): string {
  let text = '';

  for (const item of content) {
    if (item.type === 'text') {
      text += item.content;
    }
  }

  return text;
}
