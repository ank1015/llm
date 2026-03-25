import type {
  Api,
  BaseAssistantMessage,
  Content,
  TextContent,
  UserMessage,
} from '@ank1015/llm-types';

function isVisibleUserTextBlock(block: Content[number]): block is TextContent {
  return block.type === 'text' && block.metadata?.hiddenFromUI !== true;
}

export function getTextFromUserMessage(msg: UserMessage): string {
  return msg.content
    .filter(isVisibleUserTextBlock)
    .map((t) => t.content)
    .join('\n');
}

export function hasVisibleAttachmentInUserMessage(msg: UserMessage): boolean {
  return msg.content.some((block) => block.type === 'image' || block.type === 'file');
}

export function rewriteUserMessageText(message: UserMessage, textOverride: string): UserMessage {
  const preservedBlocks = message.content.filter(
    (block) => block.type !== 'text' || block.metadata?.hiddenFromUI === true
  );
  const nextContent =
    textOverride.length > 0
      ? ([{ type: 'text', content: textOverride }, ...preservedBlocks] as UserMessage['content'])
      : preservedBlocks;

  return {
    ...message,
    id: `optimistic:${message.id}:edit`,
    timestamp: Date.now(),
    content: nextContent,
  };
}

export function getTextFromBaseAssistantMessage(
  msg: Pick<BaseAssistantMessage<Api>, 'content'>
): string {
  const responseBlocks = msg.content.filter((c) => c.type === 'response');
  return responseBlocks
    .map((r) => {
      const textBlocks = r.content.filter((c) => c.type === 'text');
      return textBlocks.map((t) => t.content).join('\n');
    })
    .join('\n');
}
