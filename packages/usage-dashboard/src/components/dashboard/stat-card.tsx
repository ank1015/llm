'use client';

import { MonthlyBarChart } from '../charts';
import { Card, CardHeader, CardTitle, CardContent } from '../ui';

import type React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  chart?: { month: string; value: number }[];
  chartColor?: string;
  icon?: React.ReactNode;
}

export function StatCard({
  title,
  value,
  chart,
  chartColor,
  icon,
}: StatCardProps): React.ReactElement {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-start justify-between">
        <CardTitle>{title}</CardTitle>
        {icon && <div className="text-zinc-500">{icon}</div>}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between pt-2">
        <p className="text-4xl font-bold text-white tracking-tight">{value}</p>
        {chart && (
          <div className="mt-4">
            <MonthlyBarChart data={chart} color={chartColor} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
