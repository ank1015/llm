import type {
  NormalizedObserveOptions,
  ObserveFilter,
  ObserveInteractiveCategory,
  ObserveSnapshot,
  ObserveView,
  WindowObserveOptions,
} from './types.js';

const DEFAULT_MAX = 120;
const FILTERED_DEFAULT_MAX = 60;
const MIN_MAX = 10;
const MAX_MAX = 200;

const VALID_FILTERS: ObserveFilter[] = [
  'interactive',
  'buttons',
  'links',
  'inputs',
  'text',
  'forms',
  'media',
  'alerts',
];

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLine(value: string, max = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(1, max - 3))}...`;
}

function getLocatorText(locator: {
  id?: string;
  testId?: string;
  name?: string;
  role?: string;
  cssPath?: string;
}): string {
  if (locator.testId) return `[data-testid="${locator.testId}"]`;
  if (locator.id) return `#${locator.id}`;
  if (locator.name) return `[name="${locator.name}"]`;
  if (locator.cssPath) return locator.cssPath;
  if (locator.role) return `[role="${locator.role}"]`;
  return '(none)';
}

export function normalizeObserveOptions(input?: WindowObserveOptions): NormalizedObserveOptions {
  const dedup = new Set<ObserveFilter>();
  for (const filter of input?.filters ?? []) {
    if (VALID_FILTERS.includes(filter)) {
      dedup.add(filter);
    }
  }

  const filters = Array.from(dedup);
  const max = clamp(input?.max, MIN_MAX, MAX_MAX, DEFAULT_MAX);
  const effectiveMax =
    filters.length > 0 && input?.max === undefined ? Math.min(max, FILTERED_DEFAULT_MAX) : max;
  const semanticFilter = input?.semanticFilter?.trim() || undefined;

  const normalized: NormalizedObserveOptions = {
    filters,
    max,
    effectiveMax,
  };

  if (semanticFilter) {
    normalized.semanticFilter = semanticFilter;
  }

  return normalized;
}

export function parseObserveSnapshot(raw: unknown): ObserveSnapshot {
  if (!isObject(raw)) {
    throw new Error('Observe returned an invalid payload');
  }

  const page = raw.page;
  const summary = raw.summary;
  const interactive = raw.interactive;
  const textBlocks = raw.textBlocks;
  const forms = raw.forms;
  const media = raw.media;
  const alerts = raw.alerts;
  const truncation = raw.truncation;
  const warnings = raw.warnings;

  if (
    !isObject(page) ||
    !isObject(summary) ||
    !Array.isArray(interactive) ||
    !Array.isArray(textBlocks) ||
    !Array.isArray(forms) ||
    !Array.isArray(media) ||
    !Array.isArray(alerts) ||
    !isObject(truncation)
  ) {
    throw new Error('Observe payload is missing required fields');
  }

  return {
    page: page as unknown as ObserveSnapshot['page'],
    summary: summary as unknown as ObserveSnapshot['summary'],
    interactive: interactive as unknown as ObserveSnapshot['interactive'],
    textBlocks: textBlocks as unknown as ObserveSnapshot['textBlocks'],
    forms: forms as unknown as ObserveSnapshot['forms'],
    media: media as unknown as ObserveSnapshot['media'],
    alerts: alerts.filter((item): item is string => typeof item === 'string'),
    truncation: truncation as unknown as ObserveSnapshot['truncation'],
    warnings: Array.isArray(warnings)
      ? warnings.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

function getCategoryFilters(filters: ObserveFilter[]): ObserveInteractiveCategory[] {
  const categories = new Set<ObserveInteractiveCategory>();
  if (filters.includes('buttons')) categories.add('button');
  if (filters.includes('links')) categories.add('link');
  if (filters.includes('inputs')) categories.add('input');
  return Array.from(categories);
}

export function createObserveView(
  snapshot: ObserveSnapshot,
  options: NormalizedObserveOptions
): ObserveView {
  const hasFilters = options.filters.length > 0;
  const filterSet = new Set(options.filters);

  const categoryFilters = getCategoryFilters(options.filters);
  const includeAllInteractive = !hasFilters || filterSet.has('interactive');
  const includeInteractive =
    !hasFilters ||
    includeAllInteractive ||
    filterSet.has('buttons') ||
    filterSet.has('links') ||
    filterSet.has('inputs');
  const includeText = !hasFilters || filterSet.has('text');
  const includeForms = !hasFilters || filterSet.has('forms');
  const includeMedia = !hasFilters || filterSet.has('media');
  const includeAlerts = !hasFilters || filterSet.has('alerts');

  const interactiveBase = includeAllInteractive
    ? snapshot.interactive
    : snapshot.interactive.filter((element) => categoryFilters.includes(element.category));

  const interactive = includeInteractive ? interactiveBase.slice(0, options.effectiveMax) : [];
  const textBlocks = includeText ? snapshot.textBlocks.slice(0, options.effectiveMax) : [];
  const forms = includeForms ? snapshot.forms.slice(0, Math.min(40, options.effectiveMax)) : [];
  const media = includeMedia ? snapshot.media.slice(0, Math.min(40, options.effectiveMax)) : [];
  const alerts = includeAlerts ? snapshot.alerts.slice(0, Math.min(20, options.effectiveMax)) : [];

  return {
    interactive,
    textBlocks,
    forms,
    media,
    alerts,
    includeSections: {
      interactive: includeInteractive,
      text: includeText,
      forms: includeForms,
      media: includeMedia,
      alerts: includeAlerts,
    },
  };
}

interface RenderObserveMarkdownInput {
  windowId: number;
  tabId: number;
  snapshotId: string;
  snapshotPath: string;
  options: NormalizedObserveOptions;
  snapshot: ObserveSnapshot;
  view: ObserveView;
}

export function renderObserveMarkdown(input: RenderObserveMarkdownInput): string {
  const { windowId, tabId, snapshotId, snapshotPath, options, snapshot, view } = input;

  const lines: string[] = [];
  lines.push('# Page Observation');
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Title: ${normalizeLine(snapshot.page.title || '(untitled)', 180)}`);
  lines.push(`- URL: ${snapshot.page.url || '(empty)'}`);
  lines.push(`- Tab: ${tabId} (window ${windowId})`);
  lines.push(
    `- Viewport: ${snapshot.page.viewport.width}x${snapshot.page.viewport.height}, scroll=(${snapshot.page.scroll.x}, ${snapshot.page.scroll.y}/${snapshot.page.scroll.maxY})`
  );
  lines.push(
    `- Totals: interactive=${snapshot.summary.totalInteractiveCount}, text=${snapshot.summary.totalTextBlockCount}, forms=${snapshot.summary.formCount}, media=${snapshot.summary.mediaCount}, alerts=${snapshot.summary.alertCount}`
  );
  lines.push(
    `- Returned: interactive=${view.interactive.length}, text=${view.textBlocks.length}, forms=${view.forms.length}, media=${view.media.length}, alerts=${view.alerts.length}`
  );
  lines.push(`- Snapshot: ${snapshotId}`);
  lines.push('');

  if (view.includeSections.interactive) {
    lines.push('## Interactive Elements');
    if (view.interactive.length === 0) {
      lines.push('- (none)');
    } else {
      for (const element of view.interactive) {
        const roleText = element.role ? ` role=${element.role}` : '';
        const stateText = element.state.length > 0 ? element.state.join(', ') : 'none';
        const hrefText = element.href ? ` href=${normalizeLine(element.href, 120)}` : '';
        lines.push(
          `- **${element.id}** [${element.category}] \`${element.tag}${roleText}\` "${normalizeLine(element.name || '(unnamed)', 120)}" | actions=${element.actions.join(', ')} | state=${stateText} | locator=${normalizeLine(getLocatorText(element.locator), 120)} | box=(${element.bbox.x},${element.bbox.y},${element.bbox.width}x${element.bbox.height})${hrefText}`
        );
      }
    }
    lines.push('');
  }

  if (view.includeSections.text) {
    lines.push('## Text Blocks');
    if (view.textBlocks.length === 0) {
      lines.push('- (none)');
    } else {
      for (const block of view.textBlocks) {
        const levelSuffix = block.level ? ` h${block.level}` : '';
        lines.push(
          `- **${block.id}** [${block.kind}${levelSuffix}] ${normalizeLine(block.text, 280)}`
        );
      }
    }
    lines.push('');
  }

  if (view.includeSections.forms) {
    lines.push('## Forms');
    if (view.forms.length === 0) {
      lines.push('- (none)');
    } else {
      for (const form of view.forms) {
        const fieldText = form.fields.length > 0 ? form.fields.join(', ') : '(none)';
        const submitText = form.submitButtons.length > 0 ? form.submitButtons.join(', ') : '(none)';
        lines.push(
          `- **${form.id}** ${normalizeLine(form.name || '(unnamed)', 120)} | fields=${normalizeLine(fieldText, 180)} | submit=${normalizeLine(submitText, 120)}`
        );
      }
    }
    lines.push('');
  }

  if (view.includeSections.media) {
    lines.push('## Media');
    if (view.media.length === 0) {
      lines.push('- (none)');
    } else {
      for (const item of view.media) {
        const stateText = item.state.length > 0 ? item.state.join(', ') : 'unknown';
        lines.push(
          `- **${item.id}** [${item.kind}] "${normalizeLine(item.name || '(unnamed)', 120)}" | state=${stateText} | time=${item.currentTime.toFixed(1)}/${item.duration >= 0 ? item.duration.toFixed(1) : 'live/unknown'}`
        );
      }
    }
    lines.push('');
  }

  if (view.includeSections.alerts) {
    lines.push('## Alerts');
    if (view.alerts.length === 0) {
      lines.push('- (none)');
    } else {
      for (const alert of view.alerts) {
        lines.push(`- ${normalizeLine(alert, 260)}`);
      }
    }
    lines.push('');
  }

  lines.push('## Notes');
  if (options.filters.length > 0) {
    lines.push(`- Applied filters: ${options.filters.join(', ')}`);
  } else {
    lines.push('- Applied filters: none');
  }

  if (snapshot.truncation.interactive) {
    lines.push(
      `- Interactive elements truncated (${snapshot.summary.interactiveCount}/${snapshot.summary.totalInteractiveCount}).`
    );
  }
  if (snapshot.truncation.textBlocks) {
    lines.push(
      `- Text blocks truncated (${snapshot.summary.textBlockCount}/${snapshot.summary.totalTextBlockCount}).`
    );
  }
  if (snapshot.truncation.hiddenFilteredCount > 0) {
    lines.push(`- ${snapshot.truncation.hiddenFilteredCount} hidden elements were excluded.`);
  }
  if (snapshot.truncation.offscreenFilteredCount > 0) {
    lines.push(`- ${snapshot.truncation.offscreenFilteredCount} offscreen elements were excluded.`);
  }
  if (snapshot.warnings.length > 0) {
    for (const warning of snapshot.warnings) {
      lines.push(`- ${normalizeLine(warning, 260)}`);
    }
  }
  lines.push(`- Full snapshot file: ${snapshotPath}`);

  return lines.join('\n');
}
