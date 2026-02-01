'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3001';

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google', placeholder: 'AIza...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'kimi', name: 'Kimi', placeholder: 'sk-...' },
  { id: 'zai', name: 'Z.AI', placeholder: 'sk-...' },
] as const;

type ProviderId = (typeof PROVIDERS)[number]['id'];

interface KeyStatus {
  exists: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export default function Home() {
  const [keyStatuses, setKeyStatuses] = useState<Record<ProviderId, KeyStatus>>(
    () =>
      Object.fromEntries(
        PROVIDERS.map((p) => [p.id, { exists: false, loading: true, saving: false, error: null }])
      ) as Record<ProviderId, KeyStatus>
  );
  const [keyInputs, setKeyInputs] = useState<Record<ProviderId, string>>(
    () => Object.fromEntries(PROVIDERS.map((p) => [p.id, ''])) as Record<ProviderId, string>
  );

  useEffect(() => {
    PROVIDERS.forEach((provider) => {
      checkKeyStatus(provider.id);
    });
  }, []);

  async function checkKeyStatus(providerId: ProviderId) {
    try {
      const response = await fetch(`${API_BASE}/keys/${providerId}`);
      const data = await response.json();
      setKeyStatuses((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], exists: data.exists, loading: false, error: null },
      }));
    } catch {
      setKeyStatuses((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], loading: false, error: 'Failed to check status' },
      }));
    }
  }

  async function saveKey(providerId: ProviderId) {
    const apiKey = keyInputs[providerId];
    if (!apiKey.trim()) return;

    setKeyStatuses((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], saving: true, error: null },
    }));

    try {
      const response = await fetch(`${API_BASE}/keys/${providerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save');
      }

      setKeyStatuses((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], exists: true, saving: false },
      }));
      setKeyInputs((prev) => ({ ...prev, [providerId]: '' }));
    } catch (err) {
      setKeyStatuses((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          saving: false,
          error: err instanceof Error ? err.message : 'Failed to save',
        },
      }));
    }
  }

  async function deleteKey(providerId: ProviderId) {
    setKeyStatuses((prev) => ({
      ...prev,
      [providerId]: { ...prev[providerId], saving: true, error: null },
    }));

    try {
      const response = await fetch(`${API_BASE}/keys/${providerId}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete');
      }

      setKeyStatuses((prev) => ({
        ...prev,
        [providerId]: { ...prev[providerId], exists: false, saving: false },
      }));
    } catch (err) {
      setKeyStatuses((prev) => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          saving: false,
          error: err instanceof Error ? err.message : 'Failed to delete',
        },
      }));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
          LLM Usage Dashboard
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          Manage your API keys for different providers.
        </p>

        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const status = keyStatuses[provider.id];
            const input = keyInputs[provider.id];

            return (
              <div
                key={provider.id}
                className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {provider.name}
                    </h2>
                    {status.loading ? (
                      <span className="text-xs text-zinc-400">Loading...</span>
                    ) : status.exists ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Key Set
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        Not Set
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={
                      status.exists ? 'Enter new key to update...' : provider.placeholder
                    }
                    value={input}
                    onChange={(e) =>
                      setKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={status.saving}
                  />
                  <button
                    onClick={() => saveKey(provider.id)}
                    disabled={!input.trim() || status.saving}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {status.saving ? '...' : 'Save'}
                  </button>
                  {status.exists && (
                    <button
                      onClick={() => deleteKey(provider.id)}
                      disabled={status.saving}
                      className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {status.error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">{status.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
