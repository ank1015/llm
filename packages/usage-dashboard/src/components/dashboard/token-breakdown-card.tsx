'use client';

import { Card, CardHeader, CardTitle, CardContent } from '../ui';

import type React from 'react';

interface TokenBreakdownCardProps {
  input: number;
  output: number;
  total: number;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toString();
}

export function TokenBreakdownCard({
  input,
  output,
  total,
}: TokenBreakdownCardProps): React.ReactElement {
  const inputPercent = total > 0 ? (input / total) * 100 : 0;
  const outputPercent = total > 0 ? (output / total) * 100 : 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Token Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-4">
        {/* Input Tokens */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-zinc-300">Input</span>
            <span className="text-sm font-medium text-white">{formatTokens(input)}</span>
          </div>
          <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${inputPercent}%` }}
            />
          </div>
        </div>

        {/* Output Tokens */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-zinc-300">Output</span>
            <span className="text-sm font-medium text-white">{formatTokens(output)}</span>
          </div>
          <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${outputPercent}%` }}
            />
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-xs text-zinc-400">{inputPercent.toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-400">{outputPercent.toFixed(0)}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
