import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessages } from '@/components/assistant-messages';

const preferencesState = vi.hoisted(() => ({
  advancedMode: false,
}));

vi.mock('@/components/assistant-turn-metrics', () => ({
  AssistantTurnMetricsInline: () => <div data-testid="assistant-turn-metrics" />,
}));

vi.mock('@/components/markdown-renderer', () => ({
  ChatMarkdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/working-trace', () => ({
  WorkingTrace: () => <div data-testid="working-trace" />,
}));

vi.mock('@/lib/messages/assistant-turn-metrics', () => ({
  getAssistantTurnMetrics: () => ({
    actualCost: 0.0123,
    cacheHitPercent: 0.45,
    contextTotalTokens: 1200,
    contextUtilization: 0.3,
    contextWindow: 4000,
  }),
}));

vi.mock('@/lib/messages/working-trace', () => ({
  buildWorkingTraceModel: () => ({
    finalResponseText: 'Assistant reply',
  }),
}));

vi.mock('@/stores/chat-store', () => ({
  useChatStore: (
    selector: (state: { agentEventsBySession: Record<string, unknown[]> }) => unknown
  ) =>
    selector({
      agentEventsBySession: {},
    }),
}));

vi.mock('@/stores/project-preferences-store', () => ({
  useProjectPreferencesStore: (
    selector: (state: { isAdvancedModeEnabled: (projectId: string) => boolean }) => unknown
  ) =>
    selector({
      isAdvancedModeEnabled: (projectId: string) =>
        projectId === 'project-1' ? preferencesState.advancedMode : false,
    }),
}));

describe('AssistantMessages', () => {
  beforeEach(() => {
    preferencesState.advancedMode = false;
  });

  function renderAssistantMessages() {
    return render(
      <AssistantMessages
        cotMessages={[]}
        assistantNode={
          {
            id: 'assistant-node-1',
            parentId: 'user-node-1',
            timestamp: '2026-04-17T00:00:01.000Z',
            message: {
              role: 'assistant',
              id: 'assistant-message-1',
              api: 'codex',
              model: 'gpt-5.5',
              message: {},
              timestamp: Date.parse('2026-04-17T00:00:01.000Z'),
              duration: 1200,
              stopReason: 'stop',
              content: [],
              usage: {},
            },
          } as never
        }
        isStreamingTurn={false}
        streamingAssistant={null}
        api="codex"
        projectId="project-1"
        sessionKey="session-1"
        userTimestamp={Date.parse('2026-04-17T00:00:00.000Z')}
        onExportChat={() => 'exported markdown'}
      />
    );
  }

  it('hides context, cost, and cache metrics in non-advanced mode', () => {
    renderAssistantMessages();

    expect(screen.queryByTestId('assistant-turn-metrics')).not.toBeInTheDocument();
  });

  it('shows context, cost, and cache metrics in advanced mode', () => {
    preferencesState.advancedMode = true;

    renderAssistantMessages();

    expect(screen.getByTestId('assistant-turn-metrics')).toBeInTheDocument();
  });
});
