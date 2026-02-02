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
      <CardHeader className="pb-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-2 overflow-hidden">
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
          {stats.map((stat) => (
            <div key={stat.name} className="flex items-center pb-2">
              <span className="text-xs text-zinc-500 w-4">{stat.rank}.</span>
              <span className="text-sm text-white flex-1">{stat.name}</span>
              <div className="w-20 h-2 bg-zinc-700 rounded-full overflow-hidden flex-shrink-0">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${stat.percentage}%`, backgroundColor: stat.color }}
                />
              </div>
              <span className="text-sm text-white font-medium w-14 text-right">{stat.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
