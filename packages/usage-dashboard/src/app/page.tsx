'use client';

import type React from 'react';

import {
  StatCard,
  ProviderStatsCard,
  UsageChartCard,
  TokenBreakdownCard,
  MiniStatCard,
  TopModelsCard,
} from '@/components';
import { useUsageStatsQuery, useUsageMessagesQuery } from '@/lib/queries';

// Provider colors mapping
const PROVIDER_COLORS: Record<string, string> = {
  openai: '#3b82f6',
  anthropic: '#f97316',
  google: '#22c55e',
  deepseek: '#a855f7',
  kimi: '#ec4899',
  zai: '#06b6d4',
};

// Provider display names
const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  zai: 'Z.AI',
};

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

function MessageIcon(): React.ReactElement {
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CacheIcon(): React.ReactElement {
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
      <path d="M12 2v4" />
      <path d="m16.2 7.8 2.9-2.9" />
      <path d="M18 12h4" />
      <path d="m16.2 16.2 2.9 2.9" />
      <path d="M12 18v4" />
      <path d="m4.9 19.1 2.9-2.9" />
      <path d="M2 12h4" />
      <path d="m4.9 4.9 2.9 2.9" />
    </svg>
  );
}

function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

function formatCost(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(4)}`;
}

export default function OverviewPage(): React.ReactElement {
  const { data: stats, isLoading, refetch } = useUsageStatsQuery();
  const { data: messagesData } = useUsageMessagesQuery(undefined, { limit: 50 });

  // Transform provider stats for the card
  const providerStats = stats
    ? Object.entries(stats.byApi)
        .map(([api, data], index) => ({
          rank: index + 1,
          name: PROVIDER_NAMES[api] || api,
          value: formatCost(data.cost.total),
          percentage:
            stats.cost.total > 0 ? Math.round((data.cost.total / stats.cost.total) * 100) : 0,
          color: PROVIDER_COLORS[api] || '#71717a',
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .map((item, index) => ({ ...item, rank: index + 1 }))
    : [];

  // Transform model stats for the card
  const topModels = stats
    ? Object.entries(stats.byModel)
        .map(([id, data]) => ({
          id,
          name: data.modelName,
          count: data.messages,
          percentage:
            stats.totalMessages > 0 ? Math.round((data.messages / stats.totalMessages) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    : [];

  // Generate chart data from messages (group by date)
  const chartData = messagesData
    ? (() => {
        const grouped: Record<string, { tokens: number; cost: number }> = {};
        messagesData.messages.forEach((msg) => {
          const date = new Date(msg.timestamp).toLocaleDateString('en-US', { day: 'numeric' });
          if (!grouped[date]) {
            grouped[date] = { tokens: 0, cost: 0 };
          }
          grouped[date].tokens += msg.tokens.total;
          grouped[date].cost += msg.cost.total;
        });
        return Object.entries(grouped)
          .map(([date, data]) => ({
            date,
            tokens: data.tokens,
            cost: Math.round(data.cost * 10000), // Scale for visibility
          }))
          .slice(-14); // Last 14 days
      })()
    : [];

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-zinc-400">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-white">Token Usage & Costs</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Row 1: Main stats */}
      <div className="grid grid-cols-12 gap-4 mb-4">
        {/* Total Token Cost */}
        <div className="col-span-12 md:col-span-3">
          <StatCard
            title="Total Token Cost"
            value={stats ? formatCost(stats.cost.total) : '--'}
            chartColor="#C2D2E7"
            icon={<CalendarIcon />}
          />
        </div>

        {/* Provider Cost Stats */}
        <div className="col-span-12 md:col-span-3">
          <ProviderStatsCard title="Provider Cost Stats" stats={providerStats} />
        </div>

        {/* Daily Usage Chart */}
        <div className="col-span-12 md:col-span-6">
          <UsageChartCard data={chartData} />
        </div>
      </div>

      {/* Row 2: Token stats and small stats */}
      <div className="grid grid-cols-12 gap-4">
        {/* Total Token Usage */}
        <div className="col-span-12 md:col-span-3">
          <StatCard
            title="Total Token Usage"
            value={stats ? formatNumber(stats.tokens.total) : '--'}
          />
        </div>

        {/* Token Breakdown */}
        <div className="col-span-12 md:col-span-3">
          <TokenBreakdownCard
            input={stats?.tokens.input ?? 0}
            output={stats?.tokens.output ?? 0}
            total={stats?.tokens.total ?? 0}
          />
        </div>

        {/* Total Messages */}
        <div className="col-span-6 md:col-span-2">
          <MiniStatCard
            title="Total Messages"
            value={stats ? stats.totalMessages.toLocaleString() : '--'}
            subtitle="API calls"
            icon={<MessageIcon />}
          />
        </div>

        {/* Cache Stats */}
        <div className="col-span-6 md:col-span-2">
          <MiniStatCard
            title="Cache Hits"
            value={stats ? formatNumber(stats.tokens.cacheRead) : '--'}
            subtitle={stats ? `${formatNumber(stats.tokens.cacheWrite)} written` : ''}
            icon={<CacheIcon />}
          />
        </div>

        {/* Top Models */}
        <div className="col-span-12 md:col-span-2">
          <TopModelsCard models={topModels} />
        </div>
      </div>
    </div>
  );
}
