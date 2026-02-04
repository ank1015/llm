import type { UserMessage } from '@ank1015/llm-sdk';

import { Message, MessageContent } from '@/components/ai/message';
import { getTextFromUserMessage } from '@/lib/messages/utils';

export const UserMessageComponent = ({ userMessage }: { userMessage: UserMessage }) => {
  const text = getTextFromUserMessage(userMessage);

  return (
    <Message className="max-w-[70%] self-end">
      {text && (
        <MessageContent className="bg-home-hover text-foreground whitespace-pre-wrap text-[15px] leading-relaxed px-3 py-3">
          {text}
        </MessageContent>
      )}
    </Message>
  );
};
