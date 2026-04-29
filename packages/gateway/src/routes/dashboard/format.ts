export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(value: number | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatRelative(value: number | null | undefined, now = Date.now()): string {
  if (!value) {
    return '—';
  }

  const diff = now - value;
  if (diff < 0) {
    return formatDate(value);
  }

  const seconds = Math.round(diff / 1_000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return formatDate(value);
}

export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined) {
    return '—';
  }

  if (milliseconds < 1_000) {
    return `${milliseconds}ms`;
  }

  const seconds = milliseconds / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '$0.00';
  }

  if (value === 0) {
    return '$0.00';
  }

  if (Math.abs(value) < 0.01) {
    return `$${value.toFixed(6)}`;
  }

  if (Math.abs(value) < 1) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(2)}`;
}

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0';
  }

  return NUMBER_FORMATTER.format(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0';
  }

  if (Math.abs(value) < 1_000) {
    return value.toString();
  }

  if (Math.abs(value) < 1_000_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatPercentage(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }

  return `${(value * 100).toFixed(digits)}%`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, Math.max(1, max - 1))}…`;
}
