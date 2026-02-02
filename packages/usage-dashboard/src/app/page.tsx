import type { Metadata } from 'next';
import type React from 'react';

export const metadata: Metadata = {
  title: 'Overview | LLM Usage Dashboard',
};

export default function OverviewPage(): React.ReactElement {
  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Token Usage & Costs</h1>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Placeholder content */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6">
          <p className="text-sm text-zinc-400 mb-2">Total Token Cost (YTD)</p>
          <p className="text-4xl font-bold text-white">--</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6">
          <p className="text-sm text-zinc-400 mb-2">Total Token Usage (M)</p>
          <p className="text-4xl font-bold text-white">--</p>
        </div>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-6">
          <p className="text-sm text-zinc-400 mb-2">Total Messages</p>
          <p className="text-4xl font-bold text-white">--</p>
        </div>
      </div>
    </div>
  );
}
