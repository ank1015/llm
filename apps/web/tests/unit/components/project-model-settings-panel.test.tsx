import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectModelSettingsPanel } from '@/components/project-model-settings-panel';
import { useChatSettingsStore } from '@/stores/chat-settings-store';

const toastState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const hookState = vi.hoisted(() => ({
  providers: [
    {
      api: 'codex',
      label: 'Codex',
      models: [{ modelId: 'codex/gpt-5.4', label: 'GPT-5.4' }],
    },
    {
      api: 'claude-code',
      label: 'Claude Code',
      models: [{ modelId: 'claude-code/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' }],
    },
    {
      api: 'openai',
      label: 'OpenAI',
      models: [{ modelId: 'openai/gpt-5.4', label: 'GPT-5.4' }],
    },
  ],
  detailsByProvider: {
    codex: {
      data: {
        provider: 'codex',
        credentials: {
          apiKey: 'codex-token',
          'chatgpt-account-id': 'acct-123',
        },
        fields: [
          {
            option: 'apiKey',
            env: 'CODEX_API_KEY',
            aliases: [],
          },
          {
            option: 'chatgpt-account-id',
            env: 'CODEX_CHATGPT_ACCOUNT_ID',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    'claude-code': {
      data: {
        provider: 'claude-code',
        credentials: {
          apiKey: 'claude-token',
        },
        fields: [
          {
            option: 'apiKey',
            env: 'CLAUDE_CODE_OAUTH_TOKEN',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
    openai: {
      data: {
        provider: 'openai',
        credentials: {
          apiKey: 'openai-token',
        },
        fields: [
          {
            option: 'apiKey',
            env: 'OPENAI_API_KEY',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    },
  } as Record<
    string,
    {
      data: {
        provider: string;
        credentials: Record<string, string>;
        fields: Array<{ option: string; env: string; aliases: string[] }>;
      };
      isPending: boolean;
      isError: boolean;
      refetch: ReturnType<typeof vi.fn>;
    }
  >,
  reloadMutations: {
    codex: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    'claude-code': {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    openai: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
  } as Record<
    string,
    {
      isPending: boolean;
      mutateAsync: ReturnType<typeof vi.fn>;
    }
  >,
  setMutations: {
    codex: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    'claude-code': {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    openai: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
  } as Record<
    string,
    {
      isPending: boolean;
      mutateAsync: ReturnType<typeof vi.fn>;
    }
  >,
}));

vi.mock('sonner', () => ({
  toast: toastState,
}));

vi.mock('@/hooks/api', () => ({
  useModelsQuery: () => ({
    data: { providers: hookState.providers },
    isPending: false,
    isError: false,
  }),
  useKeyDetailsQuery: (provider: string) => hookState.detailsByProvider[provider],
  useReloadKeyMutation: (provider: string) => hookState.reloadMutations[provider],
  useSetKeyMutation: (provider: string) => hookState.setMutations[provider],
}));

describe('ProjectModelSettingsPanel', () => {
  beforeEach(() => {
    hookState.detailsByProvider.codex = {
      data: {
        provider: 'codex',
        credentials: {
          apiKey: 'codex-token',
          'chatgpt-account-id': 'acct-123',
        },
        fields: [
          {
            option: 'apiKey',
            env: 'CODEX_API_KEY',
            aliases: [],
          },
          {
            option: 'chatgpt-account-id',
            env: 'CODEX_CHATGPT_ACCOUNT_ID',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({
        data: {
          provider: 'codex',
          credentials: {
            apiKey: 'codex-token',
            'chatgpt-account-id': 'acct-123',
          },
          fields: [
            {
              option: 'apiKey',
              env: 'CODEX_API_KEY',
              aliases: [],
            },
            {
              option: 'chatgpt-account-id',
              env: 'CODEX_CHATGPT_ACCOUNT_ID',
              aliases: [],
            },
          ],
        },
      }),
    };
    hookState.detailsByProvider['claude-code'] = {
      data: {
        provider: 'claude-code',
        credentials: {
          apiKey: 'claude-token',
        },
        fields: [
          {
            option: 'apiKey',
            env: 'CLAUDE_CODE_OAUTH_TOKEN',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({
        data: {
          provider: 'claude-code',
          credentials: {
            apiKey: 'claude-token',
          },
          fields: [
            {
              option: 'apiKey',
              env: 'CLAUDE_CODE_OAUTH_TOKEN',
              aliases: [],
            },
          ],
        },
      }),
    };
    hookState.detailsByProvider.openai = {
      data: {
        provider: 'openai',
        credentials: {
          apiKey: 'openai-token',
        },
        fields: [
          {
            option: 'apiKey',
            env: 'OPENAI_API_KEY',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
    hookState.reloadMutations.codex = {
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    };
    hookState.reloadMutations['claude-code'] = {
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    };
    hookState.reloadMutations.openai = {
      isPending: false,
      mutateAsync: vi.fn(),
    };
    hookState.setMutations.codex = {
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    };
    hookState.setMutations['claude-code'] = {
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    };
    hookState.setMutations.openai = {
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    };

    toastState.success.mockClear();
    toastState.error.mockClear();
  });

  afterEach(() => {
    useChatSettingsStore.getState().reset();
    window.localStorage.clear();
  });

  it('shows reload controls only for reloadable providers with stored credentials', () => {
    render(<ProjectModelSettingsPanel />);

    expect(screen.getByRole('button', { name: /reload codex credentials/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload claude code credentials/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reload openai credentials/i })
    ).not.toBeInTheDocument();
  });

  it('reloads provider credentials from the existing provider action', async () => {
    render(<ProjectModelSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: /reload codex credentials/i }));

    await waitFor(() => {
      expect(hookState.reloadMutations.codex.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(hookState.detailsByProvider.codex.refetch).toHaveBeenCalledTimes(1);
    expect(toastState.success).toHaveBeenCalledWith('Codex credentials reloaded.');
  });

  it('hides the reload control until reloadable provider credentials exist', () => {
    hookState.detailsByProvider.codex = {
      data: {
        provider: 'codex',
        credentials: {},
        fields: [
          {
            option: 'apiKey',
            env: 'CODEX_API_KEY',
            aliases: [],
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<ProjectModelSettingsPanel />);

    expect(
      screen.queryByRole('button', { name: /reload codex credentials/i })
    ).not.toBeInTheDocument();
  });

  it('shows the edit control only for non-auto-load providers with stored credentials', () => {
    render(<ProjectModelSettingsPanel />);

    expect(screen.getByRole('button', { name: /edit openai credentials/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /edit codex credentials/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /edit claude code credentials/i })
    ).not.toBeInTheDocument();
  });

  it('opens the edit dialog and saves updated credentials without enabling the provider', async () => {
    render(<ProjectModelSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: /edit openai credentials/i }));

    expect(screen.getByRole('heading', { name: /edit openai credentials/i })).toBeInTheDocument();

    const apiKeyInput = screen.getByLabelText(/api key/i) as HTMLInputElement;
    expect(apiKeyInput.value).toBe('openai-token');

    fireEvent.change(apiKeyInput, {
      target: {
        value: 'openai-token-updated',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(hookState.setMutations.openai.mutateAsync).toHaveBeenCalledWith({
        apiKey: 'openai-token-updated',
      });
    });
    expect(toastState.success).toHaveBeenCalledWith('Credentials updated.');
    expect(useChatSettingsStore.getState().isProviderEnabled('openai')).toBe(false);
    expect(
      screen.queryByRole('heading', { name: /edit openai credentials/i })
    ).not.toBeInTheDocument();
  });
});
