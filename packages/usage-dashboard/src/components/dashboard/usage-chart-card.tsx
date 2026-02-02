'use client';

import { useState } from 'react';

import { UsageAreaChart } from '../charts';
import { Card } from '../ui';

import type React from 'react';

const TABS = ['Aggregate', 'Per Provider', 'Cost', 'Usage'] as const;

interface UsageChartCardProps {
  data: { date: string; tokens: number; cost: number }[];
}

export function UsageChartCard({ data }: UsageChartCardProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Aggregate');

  return (
    <Card className="flex flex-col h-full">
      <div className="px-5 pt-5">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Chart title */}
        <h3 className="text-sm font-medium text-white mb-4">Daily Token Usage vs Cost</h3>
      </div>

      {/* Chart */}
      <div className="px-5 pb-5 flex-1">
        <UsageAreaChart data={data} />

        {/* Legend */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-emerald-500" />
            <span className="text-xs text-zinc-400">Usage Token</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-blue-500" />
            <span className="text-xs text-zinc-400">Valt vs Cost</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
