import { beforeEach, describe, expect, it } from 'vitest';

import { useChatSettingsStore } from '@/stores/chat-settings-store';

describe('chat settings store', () => {
  beforeEach(() => {
    useChatSettingsStore.getState().reset();
  });

  it('normalizes xhigh reasoning down to high for the Gemini model', () => {
    const store = useChatSettingsStore.getState();

    store.setModel('gemini-3.1-pro-preview');
    store.setReasoning('xhigh');

    expect(useChatSettingsStore.getState()).toMatchObject({
      api: 'google',
      modelId: 'gemini-3.1-pro-preview',
      reasoning: 'high',
    });
  });

  it('restores the default model and reasoning on reset', () => {
    const store = useChatSettingsStore.getState();

    store.setModel('claude-opus-4-6');
    store.setReasoning('low');
    store.reset();

    expect(useChatSettingsStore.getState()).toMatchObject({
      api: 'codex',
      modelId: 'gpt-5.4',
      reasoning: 'xhigh',
    });
  });
});
