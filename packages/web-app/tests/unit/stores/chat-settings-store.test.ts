import { afterEach, describe, expect, it } from 'vitest';

import { useChatSettingsStore } from '@/stores/chat-settings-store';

describe('chat settings store', () => {
  afterEach(() => {
    useChatSettingsStore.getState().reset();
  });

  it('normalizes xhigh reasoning down to high for the Gemini model', () => {
    useChatSettingsStore.getState().setModel('gemini-3.1-pro-preview');

    const state = useChatSettingsStore.getState();

    expect(state.api).toBe('google');
    expect(state.modelId).toBe('gemini-3.1-pro-preview');
    expect(state.reasoning).toBe('high');
  });

  it('restores the default model and reasoning on reset', () => {
    useChatSettingsStore.getState().setModel('claude-opus-4-6');
    useChatSettingsStore.getState().setReasoning('low');

    useChatSettingsStore.getState().reset();

    const state = useChatSettingsStore.getState();

    expect(state.api).toBe('codex');
    expect(state.modelId).toBe('gpt-5.4');
    expect(state.reasoning).toBe('xhigh');
  });
});
