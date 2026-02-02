'use client';

import { Card, CardHeader, CardTitle, CardContent } from '../ui';

import type React from 'react';

interface ProviderStat {
  rank: number;
  name: string;
  value: string;
  percentage: number;
  color: string;
}

interface ProviderStatsCardProps {
  title: string;
  stats: ProviderStat[];
}

export function ProviderStatsCard({ title, stats }: ProviderStatsCardProps): React.ReactElement {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        <div className="space-y-4">
          {stats.map((stat) => (
            <div key={stat.name} className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-4">{stat.rank}.</span>
              <span className="text-sm text-white flex-1">{stat.name}</span>
              <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${stat.percentage}%`, backgroundColor: stat.color }}
                />
              </div>
              <span className="text-sm text-white font-medium w-16 text-right">{stat.value}</span>
            </div>
          ))}
        </div>
        <button className="mt-6 text-sm text-zinc-400 hover:text-white transition-colors">
          View all providers
        </button>
      </CardContent>
    </Card>
  );
}
