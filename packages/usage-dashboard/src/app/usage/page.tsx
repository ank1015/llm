import type { Metadata } from 'next';
import type React from 'react';

export const metadata: Metadata = {
  title: 'Usage | LLM Usage Dashboard',
};

export default function UsagePage(): React.ReactElement {
  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Usage History</h1>
      </div>

      {/* Placeholder content */}
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6">
        <p className="text-zinc-400">Usage history will be displayed here.</p>
      </div>
    </div>
  );
}
