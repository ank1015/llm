'use client';

import { Card, CardHeader, CardTitle, CardContent } from '../ui';

import type React from 'react';

interface ModelStat {
  id: string;
  name: string;
  count: number;
  percentage: number;
}

interface TopModelsCardProps {
  models: ModelStat[];
}

export function TopModelsCard({ models }: TopModelsCardProps): React.ReactElement {
  const colors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899'];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top Models</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-3">
          {models.slice(0, 3).map((model, index) => (
            <div key={model.id} className="flex items-center gap-2">
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="text-xs text-zinc-300 truncate flex-1">{model.name}</span>
              <span className="text-xs text-zinc-500">{model.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
