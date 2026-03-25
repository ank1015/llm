import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsKeysPanel } from '@/components/settings-keys-panel';

const {
  clearKeyMock,
  getKeyDetailsMock,
  listKeysMock,
  reloadKeyMock,
  setKeyMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  clearKeyMock: vi.fn(),
  getKeyDetailsMock: vi.fn(),
  listKeysMock: vi.fn(),
  reloadKeyMock: vi.fn(),
  setKeyMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@ank1015/llm-core', () => ({
  getProviders: () => ['openai', 'codex', 'google', 'anthropic', 'claude-code', 'minimax'],
}));

vi.mock('@/lib/client-api', () => ({
  clearKey: clearKeyMock,
  getKeyDetails: getKeyDetailsMock,
  listKeys: listKeysMock,
  reloadKey: reloadKeyMock,
  setKey: setKeyMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

describe('SettingsKeysPanel', () => {
  beforeEach(() => {
    clearKeyMock.mockReset();
    getKeyDetailsMock.mockReset();
    listKeysMock.mockReset();
    reloadKeyMock.mockReset();
    setKeyMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('renders providers in the requested priority order', async () => {
    listKeysMock.mockResolvedValue([
      { api: 'openai', hasKey: false },
      { api: 'codex', hasKey: false },
      { api: 'google', hasKey: false },
      { api: 'anthropic', hasKey: false },
      { api: 'claude-code', hasKey: false },
      { api: 'minimax', hasKey: false },
    ]);

    render(<SettingsKeysPanel enabled />);

    await screen.findByText('Codex');
    expect(
      screen.getAllByTestId(/provider-row-/).map((row) => row.getAttribute('data-testid'))
    ).toEqual([
      'provider-row-codex',
      'provider-row-claude-code',
      'provider-row-google',
      'provider-row-openai',
      'provider-row-anthropic',
      'provider-row-minimax',
    ]);
  });

  it('loads details on first Set click and saves on the second', async () => {
    listKeysMock
      .mockResolvedValueOnce([
        { api: 'openai', hasKey: true, credentials: { apiKey: 'sk-o****7890' } },
      ])
      .mockResolvedValueOnce([
        { api: 'openai', hasKey: true, credentials: { apiKey: 'sk-u****9999' } },
      ]);
    getKeyDetailsMock.mockResolvedValue({
      credentials: { apiKey: 'sk-openai-live' },
    });
    setKeyMock.mockResolvedValue({ ok: true });

    render(<SettingsKeysPanel enabled />);

    const row = await screen.findByTestId('provider-row-openai');
    const input = within(row).getByLabelText('OpenAI key') as HTMLInputElement;
    const setButton = within(row).getByRole('button', { name: 'Set' });

    expect(input).toBeDisabled();
    expect(input.value).toBe('sk-o****7890');

    fireEvent.click(setButton);

    await waitFor(() => expect(getKeyDetailsMock).toHaveBeenCalledWith('openai'));
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input.value).toBe('sk-openai-live');

    fireEvent.change(input, { target: { value: 'sk-updated-9999' } });
    fireEvent.click(setButton);

    await waitFor(() => expect(setKeyMock).toHaveBeenCalledWith('openai', 'sk-updated-9999'));
    await waitFor(() => expect(input).toBeDisabled());
    expect(input.value).toBe('sk-u****9999');
    expect(toastSuccessMock).toHaveBeenCalledWith('OpenAI key saved');
  });

  it('uses Load/Re-load for reloadable providers', async () => {
    listKeysMock
      .mockResolvedValueOnce([{ api: 'codex', hasKey: false }])
      .mockResolvedValueOnce([
        { api: 'codex', hasKey: true, credentials: { apiKey: 'codx****1234' } },
      ]);
    reloadKeyMock.mockResolvedValue({ ok: true });

    render(<SettingsKeysPanel enabled />);

    const row = await screen.findByTestId('provider-row-codex');
    const input = within(row).getByLabelText('Codex key') as HTMLInputElement;

    expect(input).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Load' })).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Load' }));

    await waitFor(() => expect(reloadKeyMock).toHaveBeenCalledWith('codex'));
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: 'Re-load' })).toBeInTheDocument()
    );
    expect(input.value).toBe('codx****1234');
  });

  it('clears a provider and exits edit mode', async () => {
    listKeysMock
      .mockResolvedValueOnce([
        { api: 'openai', hasKey: true, credentials: { apiKey: 'sk-o****7890' } },
      ])
      .mockResolvedValueOnce([{ api: 'openai', hasKey: false }]);
    getKeyDetailsMock.mockResolvedValue({
      credentials: { apiKey: 'sk-openai-live' },
    });
    clearKeyMock.mockResolvedValue({ deleted: true });

    render(<SettingsKeysPanel enabled />);

    const row = await screen.findByTestId('provider-row-openai');
    const input = within(row).getByLabelText('OpenAI key') as HTMLInputElement;

    fireEvent.click(within(row).getByRole('button', { name: 'Set' }));
    await waitFor(() => expect(input).not.toBeDisabled());

    fireEvent.click(within(row).getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(clearKeyMock).toHaveBeenCalledWith('openai'));
    await waitFor(() => expect(input).toBeDisabled());
    expect(input.value).toBe('');
    expect(within(row).getByText('Not configured')).toBeInTheDocument();
  });
});
