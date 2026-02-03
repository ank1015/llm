import type { Api, BaseAssistantMessage } from '@ank1015/llm-sdk';

import { Message, MessageContent } from '@/components/ai/message';
import { TextShimmer } from '@/components/ai/text-shimmer';
import { getTextFromBaseAssistantMessage } from '@/lib/messages/utils';

type AssistantRenderableMessage =
  | Pick<BaseAssistantMessage<Api>, 'content'>
  | Pick<Omit<BaseAssistantMessage<Api>, 'message'>, 'content'>;

export const AssistantMessageComponent = ({
  assistantMessage,
  isStreaming = false,
}: {
  assistantMessage: AssistantRenderableMessage;
  isStreaming?: boolean;
}) => {
  const text = getTextFromBaseAssistantMessage(assistantMessage);

  return (
    <Message className="max-w-[90%]">
      {text && (
        <MessageContent
          markdown
          className="text-foreground whitespace-pre-wrap text-[15px] bg-secondary leading-relaxed"
        >
          {text}
        </MessageContent>
      )}
      {isStreaming && (
        <TextShimmer className="text-xs text-muted-foreground" duration={2} spread={15}>
          Streaming...
        </TextShimmer>
      )}
    </Message>
  );
};
