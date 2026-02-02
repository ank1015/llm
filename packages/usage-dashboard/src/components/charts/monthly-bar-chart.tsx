'use client';

import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts';

import type React from 'react';

interface MonthlyBarChartProps {
  data: { month: string; value: number }[];
  color?: string;
}

export function MonthlyBarChart({
  data,
  color = '#3b82f6',
}: MonthlyBarChartProps): React.ReactElement {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#71717a', fontSize: 11 }}
          dy={5}
        />
        <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
