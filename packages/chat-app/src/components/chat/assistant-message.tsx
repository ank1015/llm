import type { Api, BaseAssistantMessage } from '@ank1015/llm-sdk';

import { Message, MessageContent } from '@/components/ai/message';
import { getTextFromBaseAssistantMessage } from '@/lib/messages/utils';

export const AssistantMessageComponent = ({
  assistantMessage,
}: {
  assistantMessage: BaseAssistantMessage<Api>;
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
    </Message>
  );
};
