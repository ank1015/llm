import { escapeHtml, formatNumber, formatPercentage } from './format.js';

export type AlertKind = 'error' | 'info' | 'success' | 'warning';

export function renderAlert(kind: AlertKind, text: string): string {
  const role = kind === 'error' || kind === 'warning' ? 'alert' : 'status';
  return `<div class="alert alert-${kind}" role="${role}">${escapeHtml(text)}</div>`;
}

export interface StatInput {
  label: string;
  value: string;
  hint?: string;
  delta?: {
    direction: 'down' | 'flat' | 'up';
    text: string;
  };
  sparkline?: string;
}

export function renderStat(input: StatInput): string {
  const direction = input.delta?.direction ?? 'flat';
  const deltaClass = direction === 'flat' ? '' : ` ${direction}`;
  return `
    <article class="stat">
      <span class="stat-label">${escapeHtml(input.label)}</span>
      <strong class="stat-value">${escapeHtml(input.value)}</strong>
      ${input.delta ? `<span class="stat-delta${deltaClass}">${escapeHtml(input.delta.text)}</span>` : input.hint ? `<span class="stat-delta">${escapeHtml(input.hint)}</span>` : ''}
      ${input.sparkline ? `<div class="stat-spark">${input.sparkline}</div>` : ''}
    </article>
  `;
}

export interface CardInput {
  body: string;
  foot?: string;
  padded?: boolean;
  subtitle?: string;
  title?: string;
  tools?: string;
}

export function renderCard(input: CardInput): string {
  const bodyClass = input.padded === false ? 'card-body flush' : 'card-body';
  const head =
    input.title || input.tools
      ? `<div class="card-head">
          ${input.title ? `<div><h2>${escapeHtml(input.title)}</h2>${input.subtitle ? `<p class="muted">${escapeHtml(input.subtitle)}</p>` : ''}</div>` : ''}
          ${input.tools ? `<div class="row">${input.tools}</div>` : ''}
        </div>`
      : '';
  const foot = input.foot ? `<div class="card-foot">${input.foot}</div>` : '';
  return `<section class="card">${head}<div class="${bodyClass}">${input.body}</div>${foot}</section>`;
}

export function renderEmpty(text: string): string {
  return `<p class="empty">${escapeHtml(text)}</p>`;
}

export function renderPill(
  label: string,
  kind?: 'aborted' | 'default' | 'disabled' | 'error' | 'info' | 'ok' | 'running' | 'warning'
): string {
  const kindClass = kind && kind !== 'default' ? ` pill-${kind}` : '';
  return `<span class="pill${kindClass}">${escapeHtml(label)}</span>`;
}

export function renderStatusPill(status: string): string {
  switch (status) {
    case 'ok':
      return renderPill('ok', 'ok');
    case 'error':
      return renderPill('error', 'error');
    case 'aborted':
      return renderPill('aborted', 'aborted');
    case 'running':
      return renderPill('running', 'running');
    default:
      return renderPill(status);
  }
}

export interface TableColumn<TRow> {
  align?: 'left' | 'right';
  head: string;
  render(row: TRow): string;
}

export function renderTable<TRow>(input: {
  columns: TableColumn<TRow>[];
  empty: string;
  rowAttributes?(row: TRow): string | undefined;
  rows: TRow[];
}): string {
  if (input.rows.length === 0) {
    return renderEmpty(input.empty);
  }

  const head = input.columns
    .map(
      (column) =>
        `<th class="${column.align === 'right' ? 'numeric' : ''}">${escapeHtml(column.head)}</th>`
    )
    .join('');

  const body = input.rows
    .map((row) => {
      const attrs = input.rowAttributes?.(row) ?? '';
      const cells = input.columns
        .map(
          (column) =>
            `<td class="${column.align === 'right' ? 'numeric' : ''}">${column.render(row)}</td>`
        )
        .join('');

      return `<tr${attrs ? ` ${attrs}` : ''}>${cells}</tr>`;
    })
    .join('');

  return `
    <div class="table-wrap">
      <table class="data">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export function renderErrorRate(errorCount: number, totalCount: number): string {
  if (totalCount === 0) {
    return '<span class="muted">—</span>';
  }

  const rate = errorCount / totalCount;
  if (errorCount === 0) {
    return `<span class="muted">0%</span>`;
  }

  const label = formatPercentage(rate, rate < 0.1 ? 1 : 0);
  return `<span class="pill pill-error">${escapeHtml(label)}</span>`;
}

export function renderCountCell(value: number): string {
  return `<span>${formatNumber(value)}</span>`;
}

export function renderCode(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

export function renderKv(rows: Array<[string, string]>): string {
  const body = rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`).join('');
  return `<dl class="kv">${body}</dl>`;
}
