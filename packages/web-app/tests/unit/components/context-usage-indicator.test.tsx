import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ContextUsageIndicator } from '@/components/context-usage-indicator';
import { useChatSettingsStore } from '@/stores/chat-settings-store';

describe('ContextUsageIndicator', () => {
  beforeEach(() => {
    useChatSettingsStore.getState().reset();
  });

  it('renders an empty ring for zero-token usage', () => {
    render(<ContextUsageIndicator totalTokens={0} />);

    expect(
      screen.getByRole('button', {
        name: 'Context usage: 0 tokens, 0% used',
      })
    ).toBeInTheDocument();
  });
});
