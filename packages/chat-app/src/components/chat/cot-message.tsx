'use client';
import { memo, useMemo } from 'react';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from '../ai/chain-of-thought';
import { ThinkingBar } from '../ai/thinking-bar';

import type { Message } from '@ank1015/llm-sdk';

import { useUiStore } from '@/stores';

export const COTMessageComponent = ({ messages }: { messages: Message[] }) => {
  const openDrawer = useUiStore((state) => state.openSideDrawer);
  const isComplete = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'assistant') return false;
    const hasThinking = lastMessage.content.some((c) => c.type === 'thinking');
    const hasTools = lastMessage.content.some((c) => c.type === 'toolCall');
    return !hasThinking && !hasTools;
  }, [messages]);

  let duration;
  if (isComplete) {
    if (messages[0].timestamp && messages[messages.length - 1].timestamp) {
      duration = (messages[messages.length - 1].timestamp! - messages[0].timestamp) / 1000;
    }
  }

  const COTCard = memo(function COTCard({ message }: { message: Message }) {
    if (message.role === 'toolResult') {
      <ChainOfThoughtStep key={message.id + '_toolResult'}>
        <ChainOfThoughtTrigger hideChevron={true}>Tool Result</ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          {message.content.map((content, idx) => {
            if (content.type === 'text') {
              return (
                <ChainOfThoughtItem key={message.id + '_toolResult' + idx}>
                  {content.content}
                </ChainOfThoughtItem>
              );
            }
          })}
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>;
    }

    if (message.role === 'assistant') {
      const thinkingContent = message.content.filter((c) => c.type === 'thinking');
      const toolsContent = message.content.filter((c) => c.type === 'toolCall');

      if (thinkingContent.length !== 0) {
        thinkingContent.map((content, idx) => {
          return (
            <ChainOfThoughtStep key={message.id + '_thinking' + idx}>
              <ChainOfThoughtTrigger hideChevron={true}>Thinking</ChainOfThoughtTrigger>
              <ChainOfThoughtContent>
                <ChainOfThoughtItem>{content.thinkingText}</ChainOfThoughtItem>
              </ChainOfThoughtContent>
            </ChainOfThoughtStep>
          );
        });
      }

      if (toolsContent.length !== 0) {
        toolsContent.map((content, idx) => {
          <ChainOfThoughtStep key={message.id + '_toolCall' + idx}>
            <ChainOfThoughtTrigger hideChevron={true}>Calling Tool</ChainOfThoughtTrigger>
            <ChainOfThoughtContent>
              <ChainOfThoughtItem>
                Tool name: {content.name}
                Tool arguments: {JSON.stringify(content.arguments)}
              </ChainOfThoughtItem>
            </ChainOfThoughtContent>
          </ChainOfThoughtStep>;
        });
      }
    }

    return <></>;
  });

  const renderReasoningDrawer = () => {
    return (
      <div>
        <ChainOfThought>
          {messages.map((message) => (
            <COTCard key={message.id} message={message} />
          ))}
        </ChainOfThought>
      </div>
    );
  };

  const openReasoningDrawer = () => {
    openDrawer({
      title: 'Reasoning',
      renderContent: () => renderReasoningDrawer(),
    });
  };

  return (
    <div className="px-2 ">
      <ThinkingBar
        text={
          isComplete
            ? duration
              ? `Reasoned for ${duration.toFixed(1)}s`
              : 'Reasoned'
            : 'Reasoning'
        }
        className="cursor-pointer"
        onClick={openReasoningDrawer}
        stop={isComplete}
      />
    </div>
  );
};
