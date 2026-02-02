'use client';

import { Card, CardContent } from '../ui';

import type React from 'react';

interface MiniStatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export function MiniStatCard({
  title,
  value,
  subtitle,
  icon,
}: MiniStatCardProps): React.ReactElement {
  return (
    <Card className="h-full">
      <CardContent className="pt-5 flex flex-col h-full">
        <div className="flex items-start justify-between mb-2">
          <span className="text-sm text-zinc-400">{title}</span>
          {icon && <div className="text-zinc-500">{icon}</div>}
        </div>
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
