import { fillTimeline, renderRequestsChart, renderSparkline } from '../charts.js';
import {
  renderAlert,
  renderCard,
  renderCode,
  renderPill,
  renderStat,
  renderStatusPill,
  renderTable,
} from '../components.js';
import {
  buildQueryString,
  parseRangeOption,
  previousRangeWindow,
  RANGE_OPTIONS,
  rangeLabel,
  resolveRangeWindow,
} from '../filters.js';
import {
  escapeHtml,
  formatCompactNumber,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercentage,
  formatRelative,
  formatUsd,
  truncate,
} from '../format.js';
import { renderShell } from '../layout.js';

import type { GatewayEnv } from '../../../context.js';
import type {
  GatewayDatabase,
  RequestRecord,
  SenderRecord,
  UsageBreakdownRow,
} from '../../../db/index.js';
import type { RangeOption } from '../filters.js';
import type { Context } from 'hono';

type DashboardMessage = { kind: 'error' | 'info' | 'success'; text: string };

export function renderOverviewPage(
  c: Context<GatewayEnv>,
  query: Record<string, string | undefined>,
  message?: DashboardMessage
): string {
  const services = c.get('services');
  const db = services.db;
  const range = parseRangeOption(query['range']);
  const window = resolveRangeWindow(range);
  const previous = previousRangeWindow(window);

  const filter = toRangeFilter(window);
  const summary = db.getUsageSummary(filter);
  const previousSummary = db.getUsageSummary(previous);
  const timelineRows = fillTimeline(
    db.getRequestsTimeline({ ...filter, bucket: window.bucket }),
    window
  );

  const providers = db.getUsageBreakdown({ ...filter, by: 'apiModel', limit: 5 });
  const topSenders = db.getUsageBreakdown({ ...filter, by: 'senderId', limit: 5 });
  const recentRequests = db.listRequests({ ...filter, limit: 8 });
  const recentErrors = listRecentErrors(db, { ...filter, limit: 5 });

  const senderLookup = buildSenderLookup(db);

  const errorRate = summary.requestCount === 0 ? 0 : sumErrors(timelineRows) / summary.requestCount;

  return renderShell({
    active: 'overview',
    title: 'Overview',
    description: `Admin dashboard · ${rangeLabel(range)}`,
    toolbar: renderRangeSwitcher('/admin/dashboard', range, query),
    body: `
      ${message ? renderAlert(message.kind, message.text) : ''}
      ${renderStatusStrip(c)}
      <section class="grid grid-4">
        ${renderStat({
          label: 'Requests',
          value: formatNumber(summary.requestCount),
          delta: deltaCopy(summary.requestCount, previousSummary.requestCount),
          sparkline: renderSparkline(
            timelineRows,
            (row) => row.ok + row.error + row.aborted + row.running
          ),
        })}
        ${renderStat({
          label: 'Tokens',
          value: formatCompactNumber(summary.totalTokens),
          delta: deltaCopy(summary.totalTokens, previousSummary.totalTokens),
          sparkline: renderSparkline(timelineRows, (row) => row.totalTokens),
        })}
        ${renderStat({
          label: 'Cost',
          value: formatUsd(summary.costUsd),
          delta: deltaCopy(summary.costUsd, previousSummary.costUsd),
          sparkline: renderSparkline(timelineRows, (row) => row.costUsd),
        })}
        ${renderStat({
          label: 'Error rate',
          value: formatPercentage(errorRate, 1),
          hint: `${formatNumber(sumErrors(timelineRows))} of ${formatNumber(summary.requestCount)} failed`,
        })}
      </section>
      ${renderCard({
        title: 'Requests over time',
        subtitle: rangeLabel(range),
        body: renderRequestsChart(timelineRows, window),
      })}
      <section class="grid grid-2">
        ${renderProviderCard(providers)}
        ${renderSenderCard(topSenders, senderLookup)}
      </section>
      <section class="grid grid-2">
        ${renderRecentRequestsCard(recentRequests, senderLookup)}
        ${renderRecentErrorsCard(recentErrors, senderLookup)}
      </section>
    `,
  });
}

function renderStatusStrip(c: Context<GatewayEnv>): string {
  const services = c.get('services');
  const logMode = services.config.logMode;
  const providers = services.vault.listConfiguredApis();
  const logKind: 'info' | 'warning' = logMode === 'full' ? 'info' : 'warning';
  const items = [
    `<span class="pill soft"><span class="dot" style="color:var(--success)"></span>Online</span>`,
    `<span class="pill pill-${logKind}">log: ${escapeHtml(logMode)}</span>`,
    `<span class="pill soft">events: ${services.config.logEvents ? 'on' : 'off'}</span>`,
    `<span class="pill soft">${providers.length} provider${providers.length === 1 ? '' : 's'} configured</span>`,
  ];
  return `<div class="row">${items.join('')}</div>`;
}

function renderRangeSwitcher(
  basePath: string,
  active: RangeOption,
  query: Record<string, string | undefined>
): string {
  const other = { ...query };
  delete other['range'];
  const base = Object.fromEntries(
    Object.entries(other).filter(([, value]) => value !== undefined) as Array<[string, string]>
  );
  return `<nav class="btn-group" aria-label="Time range">${RANGE_OPTIONS.map(
    (option) =>
      `<a class="btn btn-sm${option === active ? ' is-active' : ''}" href="${basePath}${buildQueryString({ ...base, range: option })}">${escapeHtml(rangeLabelShort(option))}</a>`
  ).join('')}</nav>`;
}

function rangeLabelShort(range: RangeOption): string {
  switch (range) {
    case '24h':
      return '24h';
    case '7d':
      return '7d';
    case '30d':
      return '30d';
    case 'all':
      return 'All';
  }
}

function deltaCopy(
  current: number,
  previous: number
): { direction: 'down' | 'flat' | 'up'; text: string } {
  if (previous === 0) {
    if (current === 0) {
      return { direction: 'flat', text: 'No change vs previous period' };
    }
    return { direction: 'up', text: 'New activity in this window' };
  }

  const diff = current - previous;
  const ratio = diff / previous;
  if (Math.abs(ratio) < 0.005) {
    return { direction: 'flat', text: 'Roughly flat vs previous window' };
  }

  const direction: 'up' | 'down' = diff > 0 ? 'up' : 'down';
  const sign = diff > 0 ? '+' : '−';
  return {
    direction,
    text: `${sign}${formatPercentage(Math.abs(ratio), Math.abs(ratio) < 0.1 ? 1 : 0)} vs previous`,
  };
}

function toRangeFilter(window: { from?: number; to?: number }): {
  from?: number;
  to?: number;
} {
  return {
    ...(window.from !== undefined ? { from: window.from } : {}),
    ...(window.to !== undefined ? { to: window.to } : {}),
  };
}

function sumErrors(rows: Array<{ error: number; aborted: number }>): number {
  return rows.reduce((accumulator, row) => accumulator + row.error + row.aborted, 0);
}

function buildSenderLookup(db: GatewayDatabase): Map<string, SenderRecord> {
  const lookup = new Map<string, SenderRecord>();
  for (const sender of db.listSenders()) {
    lookup.set(sender.id, sender);
  }
  return lookup;
}

function senderLabel(record: SenderRecord | undefined, senderId: string | null): string {
  if (record) {
    return record.username ?? record.name;
  }

  if (!senderId) {
    return '(deleted user)';
  }

  return senderId.slice(0, 8);
}

function renderProviderCard(rows: UsageBreakdownRow[]): string {
  const body = renderTable<UsageBreakdownRow>({
    empty: 'No requests in this window.',
    rows,
    columns: [
      {
        head: 'Provider · Model',
        render: (row) => renderCode(row.key),
      },
      {
        head: 'Requests',
        align: 'right',
        render: (row) => formatNumber(row.requestCount),
      },
      {
        head: 'Tokens',
        align: 'right',
        render: (row) => formatCompactNumber(row.totalTokens),
      },
      {
        head: 'Cost',
        align: 'right',
        render: (row) => formatUsd(row.costUsd),
      },
    ],
  });

  return renderCard({
    title: 'Top models',
    subtitle: 'Requests by provider and model',
    padded: false,
    body,
  });
}

function renderSenderCard(rows: UsageBreakdownRow[], lookup: Map<string, SenderRecord>): string {
  const body = renderTable<UsageBreakdownRow>({
    empty: 'No users have sent requests in this window.',
    rows,
    columns: [
      {
        head: 'User',
        render: (row) =>
          escapeHtml(
            senderLabel(row.senderId ? lookup.get(row.senderId) : undefined, row.senderId ?? '')
          ),
      },
      {
        head: 'Requests',
        align: 'right',
        render: (row) => formatNumber(row.requestCount),
      },
      {
        head: 'Tokens',
        align: 'right',
        render: (row) => formatCompactNumber(row.totalTokens),
      },
      {
        head: 'Last seen',
        align: 'right',
        render: (row) =>
          `<span class="muted">${escapeHtml(formatRelative(row.lastStartedAt))}</span>`,
      },
    ],
  });

  return renderCard({
    title: 'Top users',
    subtitle: 'Activity by sender',
    padded: false,
    body,
  });
}

function renderRecentRequestsCard(
  requests: RequestRecord[],
  lookup: Map<string, SenderRecord>
): string {
  const body = renderTable<RequestRecord>({
    empty: 'No requests yet.',
    rows: requests,
    columns: [
      {
        head: 'Time',
        render: (row) => `<span class="muted">${escapeHtml(formatRelative(row.startedAt))}</span>`,
      },
      {
        head: 'User',
        render: (row) =>
          escapeHtml(
            senderLabel(row.senderId ? lookup.get(row.senderId) : undefined, row.senderId)
          ),
      },
      {
        head: 'Model',
        render: (row) => renderCode(`${row.api}/${row.modelId}`),
      },
      {
        head: 'Status',
        render: (row) => renderStatusPill(row.status),
      },
      {
        head: 'Cost',
        align: 'right',
        render: (row) => formatUsd(row.costUsd ?? 0),
      },
    ],
  });

  return renderCard({
    title: 'Recent requests',
    tools: `<a class="btn btn-sm" href="/admin/dashboard/requests">View all</a>`,
    padded: false,
    body,
  });
}

function renderRecentErrorsCard(
  requests: RequestRecord[],
  lookup: Map<string, SenderRecord>
): string {
  if (requests.length === 0) {
    return renderCard({
      title: 'Recent errors',
      padded: true,
      body: `<p class="muted">Nothing has failed in this window. ${renderPill('Healthy', 'ok')}</p>`,
    });
  }

  const items = requests
    .map(
      (row) => `
        <a class="event" href="/admin/dashboard/requests/${encodeURIComponent(row.id)}">
          <span class="event-time">${escapeHtml(formatRelative(row.startedAt))}</span>
          ${renderStatusPill(row.status)}
          <span class="event-body">
            <strong>${escapeHtml(senderLabel(row.senderId ? lookup.get(row.senderId) : undefined, row.senderId))}</strong>
            · <code>${escapeHtml(`${row.api}/${row.modelId}`)}</code>
            ${row.errorCode ? ` · <span class="pill pill-error">${escapeHtml(row.errorCode)}</span>` : ''}
            ${row.errorMessage ? ` <span class="muted">${escapeHtml(truncate(row.errorMessage, 80))}</span>` : ''}
          </span>
        </a>
      `
    )
    .join('');

  return renderCard({
    title: 'Recent errors',
    tools: `<a class="btn btn-sm" href="/admin/dashboard/requests?status=error">View all errors</a>`,
    body: `<div class="event-list">${items}</div>`,
  });
}

function listRecentErrors(
  db: GatewayDatabase,
  input: { from?: number; limit: number; to?: number }
): RequestRecord[] {
  const rows = db.listRequests({
    ...(input.from !== undefined ? { from: input.from } : {}),
    ...(input.to !== undefined ? { to: input.to } : {}),
    limit: 200,
  });
  return rows
    .filter((row) => row.status === 'error' || row.status === 'aborted')
    .slice(0, input.limit);
}

export function renderDashboardHome(
  c: Context<GatewayEnv>,
  query: Record<string, string | undefined>,
  message?: DashboardMessage
): string {
  return renderOverviewPage(c, query, message);
}

export type { DashboardMessage };
export { formatDate, formatDuration };
