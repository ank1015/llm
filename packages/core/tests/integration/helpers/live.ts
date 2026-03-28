import { describe } from 'vitest';

import type { Api, BaseAssistantMessage, Content } from '../../../src/types/index.js';

export function getIntegrationEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function describeIfAvailable(available: boolean): typeof describe {
  return available ? describe : describe.skip;
}

export function getAssistantText<TApi extends Api>(message: BaseAssistantMessage<TApi>): string {
  let text = '';

  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    text += getTextFromContent(block.response);
  }

  return text.trim();
}

export async function collectStreamEvents<TEvent>(stream: AsyncIterable<TEvent>): Promise<TEvent[]> {
  const events: TEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
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
