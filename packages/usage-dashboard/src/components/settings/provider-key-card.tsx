'use client';

import { useState } from 'react';

import { Card, CardContent } from '../ui';

import type { Api } from '@ank1015/llm-types';
import type React from 'react';

import { useKeyStatusQuery, useSaveKeyMutation, useDeleteKeyMutation } from '@/lib/queries';

interface ProviderKeyCardProps {
  provider: {
    id: Api;
    name: string;
    placeholder: string;
  };
}

function CheckIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ProviderKeyCard({ provider }: ProviderKeyCardProps): React.ReactElement {
  const [keyInput, setKeyInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const { data, isLoading } = useKeyStatusQuery(provider.id);
  const saveMutation = useSaveKeyMutation();
  const deleteMutation = useDeleteKeyMutation();

  const isSaving = saveMutation.isPending || deleteMutation.isPending;
  const hasKey = data?.exists ?? false;

  async function handleSave(): Promise<void> {
    if (!keyInput.trim()) return;
    await saveMutation.mutateAsync({ api: provider.id, apiKey: keyInput });
    setKeyInput('');
    setShowInput(false);
  }

  async function handleDelete(): Promise<void> {
    if (confirm(`Are you sure you want to delete the API key for ${provider.name}?`)) {
      await deleteMutation.mutateAsync(provider.id);
    }
  }

  function handleCancel(): void {
    setKeyInput('');
    setShowInput(false);
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          {/* Provider info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
              <span className="text-sm font-semibold text-white">
                {provider.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">{provider.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isLoading ? (
                  <span className="text-xs text-zinc-500">Checking...</span>
                ) : hasKey ? (
                  <>
                    <span className="text-emerald-500">
                      <CheckIcon />
                    </span>
                    <span className="text-xs text-emerald-500">Key configured</span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500">
                      <XIcon />
                    </span>
                    <span className="text-xs text-zinc-500">Not configured</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {!showInput ? (
              <>
                <button
                  onClick={() => setShowInput(true)}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-700 rounded-lg hover:bg-zinc-600 transition-colors"
                >
                  {hasKey ? 'Update' : 'Add Key'}
                </button>
                {hasKey && (
                  <button
                    onClick={handleDelete}
                    disabled={isSaving}
                    className="px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Input field */}
        {showInput && (
          <div className="mt-4 flex gap-2">
            <input
              type="password"
              placeholder={provider.placeholder}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSaving}
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={!keyInput.trim() || isSaving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}

        {/* Error message */}
        {(saveMutation.error || deleteMutation.error) && (
          <p className="mt-3 text-sm text-red-400">
            {saveMutation.error?.message || deleteMutation.error?.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
