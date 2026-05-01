import { escapeHtml, formatDate, formatNumber } from './format.js';

import type { RangeWindow } from './filters.js';
import type { TimelineRow } from '../../db/index.js';

export function fillTimeline(rows: TimelineRow[], window: RangeWindow): TimelineRow[] {
  const byBucket = new Map<number, TimelineRow>();
  for (const row of rows) {
    byBucket.set(row.bucket, row);
  }

  const filled: TimelineRow[] = [];
  for (let i = 0; i < window.bucketCount; i += 1) {
    const bucket = window.start + i * window.bucketMs;
    filled.push(
      byBucket.get(bucket) ?? {
        bucket,
        ok: 0,
        error: 0,
        aborted: 0,
        running: 0,
        totalTokens: 0,
        costUsd: 0,
      }
    );
  }

  return filled;
}

export function renderRequestsChart(rows: TimelineRow[], window: RangeWindow): string {
  const width = 1200;
  const height = 260;
  const paddingTop = 16;
  const paddingBottom = 30;
  const paddingX = 8;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingTop - paddingBottom;

  const max = Math.max(1, ...rows.map((row) => row.ok + row.error + row.aborted + row.running));
  const slot = plotWidth / Math.max(rows.length, 1);
  const gap = Math.min(14, Math.max(3, slot * 0.25));
  const maxBarWidth = 64;
  const barWidth = Math.max(4, Math.min(maxBarWidth, slot - gap));

  const bars = rows
    .map((row, index) => {
      const x = paddingX + index * slot + (slot - barWidth) / 2;
      const total = row.ok + row.error + row.aborted + row.running;
      const scale = (value: number): number => (value / max) * plotHeight;
      let cursor = paddingTop + plotHeight;
      const segments: string[] = [];
      const pushSegment = (value: number, variableName: string): void => {
        if (value <= 0) {
          return;
        }

        const segHeight = Math.max(1, scale(value));
        cursor -= segHeight;
        segments.push(
          `<rect x="${x.toFixed(2)}" y="${cursor.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${segHeight.toFixed(2)}" fill="var(${variableName})" />`
        );
      };

      pushSegment(row.aborted, '--chart-aborted');
      pushSegment(row.error, '--chart-error');
      pushSegment(row.running, '--chart-running');
      pushSegment(row.ok, '--chart-ok');

      if (total === 0) {
        segments.push(
          `<rect x="${x.toFixed(2)}" y="${(paddingTop + plotHeight - 1).toFixed(2)}" width="${barWidth.toFixed(2)}" height="1" fill="var(--chart-track)" />`
        );
      }

      const title = formatBucketTitle(row, window);
      return `<g><title>${escapeHtml(title)}</title>${segments.join('')}</g>`;
    })
    .join('');

  const ticks = buildTickLabels(rows, window);
  const axis = ticks
    .map(({ index, label }) => {
      const x = paddingX + index * slot + slot / 2;
      return `<text x="${x.toFixed(2)}" y="${(height - 8).toFixed(2)}" text-anchor="middle" font-size="10" fill="var(--muted-foreground)">${escapeHtml(label)}</text>`;
    })
    .join('');

  const baseline = `<line x1="${paddingX}" x2="${(paddingX + plotWidth).toFixed(2)}" y1="${(paddingTop + plotHeight + 0.5).toFixed(2)}" y2="${(paddingTop + plotHeight + 0.5).toFixed(2)}" stroke="var(--border)" stroke-width="1" />`;

  const svg = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Requests over time" style="overflow:hidden">${baseline}${bars}${axis}</svg>`;

  const total = rows.reduce(
    (accumulator, row) => {
      accumulator.ok += row.ok;
      accumulator.error += row.error;
      accumulator.aborted += row.aborted;
      accumulator.running += row.running;
      return accumulator;
    },
    { ok: 0, error: 0, aborted: 0, running: 0 }
  );

  const legend = `
    <div class="chart-legend">
      <span class="chart-legend-item"><span class="chart-swatch" style="background:var(--chart-ok)"></span>Ok · ${formatNumber(total.ok)}</span>
      <span class="chart-legend-item"><span class="chart-swatch" style="background:var(--chart-error)"></span>Error · ${formatNumber(total.error)}</span>
      <span class="chart-legend-item"><span class="chart-swatch" style="background:var(--chart-aborted)"></span>Aborted · ${formatNumber(total.aborted)}</span>
      ${total.running > 0 ? `<span class="chart-legend-item"><span class="chart-swatch" style="background:var(--chart-running)"></span>Running · ${formatNumber(total.running)}</span>` : ''}
    </div>
  `;

  return `<div class="chart">${svg}</div>${legend}`;
}

export function renderSparkline(
  rows: TimelineRow[],
  accessor: (row: TimelineRow) => number
): string {
  if (rows.length === 0) {
    return '';
  }

  const values = rows.map((row) => Math.max(0, accessor(row)));
  const max = Math.max(1, ...values);
  const width = 120;
  const height = 32;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const areaPath = `M0,${height} L${points.replaceAll(' ', ' L')} L${width},${height} Z`;
  const linePath = `M${points.replaceAll(' ', ' L')}`;

  return `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-hidden="true" style="overflow:hidden">
    <path d="${areaPath}" fill="currentColor" fill-opacity="0.08" />
    <path d="${linePath}" fill="none" stroke="currentColor" stroke-width="1.25" />
  </svg>`;
}

function buildTickLabels(
  rows: TimelineRow[],
  window: RangeWindow
): Array<{ index: number; label: string }> {
  if (rows.length === 0) {
    return [];
  }

  const maxLabels = window.bucket === 'hour' ? 6 : 5;
  const step = Math.max(1, Math.ceil(rows.length / maxLabels));
  const labels: Array<{ index: number; label: string }> = [];

  for (let index = 0; index < rows.length; index += step) {
    labels.push({
      index,
      label: formatBucketTick(rows[index]!.bucket, window),
    });
  }

  const lastIndex = rows.length - 1;
  if (labels.length === 0 || labels[labels.length - 1]!.index !== lastIndex) {
    labels.push({ index: lastIndex, label: formatBucketTick(rows[lastIndex]!.bucket, window) });
  }

  return labels;
}

function formatBucketTick(bucket: number, window: RangeWindow): string {
  const date = new Date(bucket);
  if (window.bucket === 'hour') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBucketTitle(row: TimelineRow, window: RangeWindow): string {
  const total = row.ok + row.error + row.aborted + row.running;
  return `${formatDate(row.bucket)} · ${window.bucket} · ${formatNumber(total)} requests (${formatNumber(row.ok)} ok, ${formatNumber(row.error)} err, ${formatNumber(row.aborted)} aborted)`;
}
