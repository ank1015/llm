import type { UserMessage } from '@ank1015/llm-sdk';

import { Message, MessageContent } from '@/components/ai/message';
import { getTextFromUserMessage } from '@/lib/messages/utils';

export const UserMessageComponent = ({ userMessage }: { userMessage: UserMessage }) => {
  const text = getTextFromUserMessage(userMessage);

  return (
    <Message className="self-end max-w-[70%]">
      {text && (
        <MessageContent className="text-foreground whitespace-pre-wrap text-[15px] leading-relaxed bg-tertiary">
          {text}
        </MessageContent>
      )}
    </Message>
  );
};
