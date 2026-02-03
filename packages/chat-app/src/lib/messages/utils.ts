import type { Api, BaseAssistantMessage, UserMessage } from '@ank1015/llm-sdk';

export function getTextFromUserMessage(msg: UserMessage): string {
  const textContentBlocks = msg.content.filter((c) => c.type === 'text');
  return textContentBlocks.map((t) => t.content).join('\n');
}

export function getTextFromBaseAssistantMessage(msg: BaseAssistantMessage<Api>): string {
  const responseBlocks = msg.content.filter((c) => c.type === 'response');
  return responseBlocks
    .map((r) => {
      const textBlocks = r.content.filter((c) => c.type === 'text');
      return textBlocks.map((t) => t.content).join('\n');
    })
    .join('\n');
}
