'use client';

import { useState } from 'react';

import type { Api } from '@ank1015/llm-types';

import { useKeyStatusQuery, useSaveKeyMutation, useDeleteKeyMutation } from '@/lib/queries';

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google', placeholder: 'AIza...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'kimi', name: 'Kimi', placeholder: 'sk-...' },
  { id: 'zai', name: 'Z.AI', placeholder: 'sk-...' },
] as const;

interface ProviderCardProps {
  provider: (typeof PROVIDERS)[number];
}

function ProviderCard({ provider }: ProviderCardProps) {
  const [keyInput, setKeyInput] = useState('');

  const { data, isLoading, error } = useKeyStatusQuery(provider.id as Api);
  const saveMutation = useSaveKeyMutation();
  const deleteMutation = useDeleteKeyMutation();

  const isSaving = saveMutation.isPending || deleteMutation.isPending;
  const mutationError = saveMutation.error || deleteMutation.error;

  async function handleSave() {
    if (!keyInput.trim()) return;
    await saveMutation.mutateAsync({ api: provider.id as Api, apiKey: keyInput });
    setKeyInput('');
  }

  async function handleDelete() {
    await deleteMutation.mutateAsync(provider.id as Api);
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{provider.name}</h2>
          {isLoading ? (
            <span className="text-xs text-zinc-400">Loading...</span>
          ) : data?.exists ? (
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
          placeholder={data?.exists ? 'Enter new key to update...' : provider.placeholder}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSaving}
        />
        <button
          onClick={handleSave}
          disabled={!keyInput.trim() || isSaving}
          className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saveMutation.isPending ? '...' : 'Save'}
        </button>
        {data?.exists && (
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleteMutation.isPending ? '...' : 'Delete'}
          </button>
        )}
      </div>

      {(error || mutationError) && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error?.message || mutationError?.message}
        </p>
      )}
    </div>
  );
}

export default function Home() {
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
          {PROVIDERS.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </main>
    </div>
  );
}
