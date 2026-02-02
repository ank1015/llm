'use client';

import { BarChart, Bar, ResponsiveContainer } from 'recharts';

import type React from 'react';

interface MiniBarChartProps {
  data: { value: number }[];
  color?: string;
}

export function MiniBarChart({ data, color = '#22c55e' }: MiniBarChartProps): React.ReactElement {
  return (
    <ResponsiveContainer width="100%" height={32}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Bar dataKey="value" fill={color} radius={[2, 2, 2, 2]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
