'use client';

import type { Api } from '@ank1015/llm-types';
import type React from 'react';

import { ProviderKeyCard } from '@/components';

const PROVIDERS: { id: Api; name: string; placeholder: string }[] = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-api...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google', placeholder: 'AIza...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'kimi', name: 'Kimi', placeholder: 'sk-...' },
  { id: 'zai', name: 'Z.AI', placeholder: 'sk-...' },
];

export default function SettingsPage(): React.ReactElement {
  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-zinc-400 mt-1">Manage your API keys for different LLM providers</p>
        </div>
      </div>

      {/* API Keys Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white mb-4">API Keys</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PROVIDERS.map((provider) => (
            <ProviderKeyCard key={provider.id} provider={provider} />
          ))}
        </div>
      </div>
    </div>
  );
}
