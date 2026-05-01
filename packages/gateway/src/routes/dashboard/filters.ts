import type { TimelineBucket } from '../../db/index.js';

export const RANGE_OPTIONS = ['24h', '7d', '30d', 'all'] as const;

export type RangeOption = (typeof RANGE_OPTIONS)[number];

export function isRangeOption(value: unknown): value is RangeOption {
  return typeof value === 'string' && (RANGE_OPTIONS as readonly string[]).includes(value);
}

export function parseRangeOption(
  value: string | undefined,
  fallback: RangeOption = '7d'
): RangeOption {
  if (isRangeOption(value)) {
    return value;
  }

  return fallback;
}

export function rangeLabel(range: RangeOption): string {
  switch (range) {
    case '24h':
      return 'Last 24 hours';
    case '7d':
      return 'Last 7 days';
    case '30d':
      return 'Last 30 days';
    case 'all':
      return 'All time';
  }
}

export interface RangeWindow {
  bucket: TimelineBucket;
  bucketCount: number;
  bucketMs: number;
  end: number;
  from?: number;
  start: number;
  to?: number;
}

export function resolveRangeWindow(range: RangeOption, now = Date.now()): RangeWindow {
  switch (range) {
    case '24h': {
      const bucketMs = 3_600_000;
      const end = Math.ceil(now / bucketMs) * bucketMs;
      const start = end - 24 * bucketMs;
      return {
        bucket: 'hour',
        bucketCount: 24,
        bucketMs,
        start,
        end,
        from: start,
        to: end,
      };
    }
    case '7d': {
      const bucketMs = 86_400_000;
      const end = Math.ceil(now / bucketMs) * bucketMs;
      const start = end - 7 * bucketMs;
      return {
        bucket: 'day',
        bucketCount: 7,
        bucketMs,
        start,
        end,
        from: start,
        to: end,
      };
    }
    case '30d': {
      const bucketMs = 86_400_000;
      const end = Math.ceil(now / bucketMs) * bucketMs;
      const start = end - 30 * bucketMs;
      return {
        bucket: 'day',
        bucketCount: 30,
        bucketMs,
        start,
        end,
        from: start,
        to: end,
      };
    }
    case 'all': {
      const bucketMs = 86_400_000;
      const end = Math.ceil(now / bucketMs) * bucketMs;
      const start = end - 90 * bucketMs;
      return {
        bucket: 'day',
        bucketCount: 90,
        bucketMs,
        start,
        end,
      };
    }
  }
}

export function previousRangeWindow(window: RangeWindow): { from?: number; to?: number } {
  if (window.from === undefined || window.to === undefined) {
    return {};
  }

  const span = window.to - window.from;
  return {
    from: window.from - span,
    to: window.from,
  };
}

export function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

export interface DashboardCommonQuery {
  range: RangeOption;
  senderId?: string;
}

export function parseCommonQuery(query: Record<string, string | undefined>): DashboardCommonQuery {
  const range = parseRangeOption(query['range']);
  const senderIdRaw = query['senderId']?.trim();

  return {
    range,
    ...(senderIdRaw ? { senderId: senderIdRaw } : {}),
  };
}

export function buildQueryString(
  params: Record<string, string | number | undefined | null>
): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  ) as Array<[string, string | number]>;
  if (entries.length === 0) {
    return '';
  }

  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.set(key, String(value));
  }

  return `?${search.toString()}`;
}
