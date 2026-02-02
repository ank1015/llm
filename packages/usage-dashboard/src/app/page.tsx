'use client';

import type React from 'react';

import { StatCard, ProviderStatsCard, UsageChartCard } from '@/components';

// Mock data for charts
const MONTHLY_COST_DATA = [
  { month: 'Jan', value: 8400 },
  { month: 'Feb', value: 1800 },
  { month: 'Mar', value: 3200 },
  { month: 'Apr', value: 2800 },
  { month: 'May', value: 4100 },
  { month: 'Jun', value: 3600 },
  { month: 'Jul', value: 3100 },
];

const DAILY_USAGE_DATA = [
  { date: '1', tokens: 4000, cost: 2400 },
  { date: '2', tokens: 3000, cost: 1398 },
  { date: '3', tokens: 2000, cost: 4800 },
  { date: '4', tokens: 2780, cost: 3908 },
  { date: '5', tokens: 1890, cost: 4800 },
  { date: '6', tokens: 2390, cost: 3800 },
  { date: '7', tokens: 3490, cost: 4300 },
  { date: '8', tokens: 4000, cost: 2400 },
  { date: '9', tokens: 3000, cost: 1398 },
  { date: '10', tokens: 2000, cost: 3800 },
  { date: '11', tokens: 2780, cost: 3908 },
  { date: '12', tokens: 1890, cost: 4800 },
  { date: '13', tokens: 2390, cost: 3800 },
  { date: '14', tokens: 3490, cost: 4300 },
];

const PROVIDER_STATS = [
  { rank: 1, name: 'OpenAI', value: '33.5k', percentage: 100, color: '#3b82f6' },
  { rank: 2, name: 'Anthropic', value: '13.5k', percentage: 40, color: '#f97316' },
  { rank: 3, name: 'Google', value: '4.5k', percentage: 13, color: '#22c55e' },
];

function CalendarIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

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

      {/* Row 1: Main stats */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Total Token Cost */}
        <div className="col-span-12 md:col-span-3">
          <StatCard
            title="Total Token Cost (YTD)"
            value="$12,450"
            chart={MONTHLY_COST_DATA}
            chartColor="#C2D2E7"
            icon={<CalendarIcon />}
          />
        </div>

        {/* Total Token Usage */}
        <div className="col-span-12 md:col-span-3">
          <StatCard title="Total Token Usage (M)" value="4.5B" />
        </div>

        {/* Daily Usage Chart */}
        <div className="col-span-12 md:col-span-6">
          <UsageChartCard data={DAILY_USAGE_DATA} />
        </div>
      </div>

      {/* Row 3: Provider stats and info cards */}
      <div className="grid grid-cols-12 gap-4">
        {/* Provider Cost Stats */}
        <div className="col-span-12 md:col-span-3">
          <ProviderStatsCard title="Provider Cost Stats" stats={PROVIDER_STATS} />
        </div>

        {/* Empty space for cost trend extension */}
        <div className="col-span-12 md:col-span-3">{/* Intentionally empty */}</div>
      </div>
    </div>
  );
}
