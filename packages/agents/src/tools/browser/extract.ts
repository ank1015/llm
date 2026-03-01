import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import type { AgentTool } from '@ank1015/llm-sdk';

const extractLinksWhatSchema = Type.Object({
  type: Type.Literal('links'),
  filter: Type.Optional(
    Type.String({
      description: 'Optional case-insensitive filter applied to link text and URL.',
    })
  ),
  limit: Type.Optional(
    Type.Number({
      description: 'Maximum links to return (default: 80, range: 1-300).',
    })
  ),
});

const extractMainTextWhatSchema = Type.Object({
  type: Type.Literal('main_text'),
  maxChars: Type.Optional(
    Type.Number({
      description: 'Maximum characters to return (default: 16000, range: 500-50000).',
    })
  ),
});

const extractSelectedTextWhatSchema = Type.Object({
  type: Type.Literal('selected_text'),
});

const extractContainerHtmlWhatSchema = Type.Object({
  type: Type.Literal('container_html'),
  selector: Type.String({
    description: 'CSS selector for the container whose HTML should be extracted.',
  }),
  maxChars: Type.Optional(
    Type.Number({
      description: 'Maximum characters to return (default: 20000, range: 500-100000).',
    })
  ),
});

const extractWhatSchema = Type.Union([
  extractLinksWhatSchema,
  extractMainTextWhatSchema,
  extractSelectedTextWhatSchema,
  extractContainerHtmlWhatSchema,
]);

const extractSchema = Type.Object({
  tabId: Type.Optional(
    Type.Number({
      description:
        'Optional tab id to extract from. If omitted, extracts from the active tab in the scoped window.',
    })
  ),
  what: extractWhatSchema,
});

export type ExtractToolInput = Static<typeof extractSchema>;
export type ExtractWhatInput = Static<typeof extractWhatSchema>;
export type ExtractKind = ExtractWhatInput['type'];

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
  active?: boolean;
}

interface ExtractChromeClient {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

interface DebuggerEvaluateResult {
  result?: unknown;
}

interface ExtractScriptPage {
  url: string;
  title: string;
}

interface ExtractScriptResult {
  success: boolean;
  kind: ExtractKind;
  page: ExtractScriptPage;
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  links?: ExtractLink[];
  text?: string;
  selector?: string;
  warnings: string[];
  message?: string;
}

interface ExtractWhatLinks {
  type: 'links';
  limit: number;
  filter?: string;
}

interface ExtractWhatMainText {
  type: 'main_text';
  maxChars: number;
}

interface ExtractWhatSelectedText {
  type: 'selected_text';
  maxChars: number;
}

interface ExtractWhatContainerHtml {
  type: 'container_html';
  selector: string;
  maxChars: number;
}

type NormalizedExtractWhat =
  | ExtractWhatLinks
  | ExtractWhatMainText
  | ExtractWhatSelectedText
  | ExtractWhatContainerHtml;

interface ExtractPayload {
  what: NormalizedExtractWhat;
}

export interface ExtractTab {
  tabId: number;
  url: string;
  title: string;
}

export interface ExtractLink {
  text: string;
  url: string;
}

export interface ExtractToolDetails {
  tab: ExtractTab;
  windowId: number;
  kind: ExtractKind;
  what: ExtractWhatInput;
  totalCount: number;
  returnedCount: number;
  truncated: boolean;
  links?: ExtractLink[];
  text?: string;
  selector?: string;
  warnings?: string[];
}

export interface ExtractOperations {
  getClient: () => Promise<ExtractChromeClient>;
}

export interface ExtractToolOptions {
  /** Browser window scope used for all operations in this tool instance */
  windowId: number;
  /** Options passed to @ank1015/llm-extension connect() */
  connectOptions?: ConnectOptions;
  /** Custom operations for testing or alternative transports */
  operations?: ExtractOperations;
}

const DEFAULT_LINK_LIMIT = 80;
const DEFAULT_MAIN_TEXT_MAX_CHARS = 16000;
const DEFAULT_SELECTED_TEXT_MAX_CHARS = 16000;
const DEFAULT_CONTAINER_HTML_MAX_CHARS = 20000;

function createDefaultGetClient(
  connectOptions?: ConnectOptions
): () => Promise<ExtractChromeClient> {
  let clientPromise: Promise<ExtractChromeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = connect({ launch: true, ...connectOptions });
    }
    return clientPromise;
  };
}

async function callChrome<T>(
  client: ExtractChromeClient,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return (await client.call(method, ...args)) as T;
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function toExtractTab(tab: ChromeTab): ExtractTab {
  if (typeof tab.id !== 'number') {
    throw new Error('Chrome tab response did not include a numeric tab id');
  }

  return {
    tabId: tab.id,
    url: tab.url ?? '',
    title: tab.title ?? '',
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExtractKind(value: unknown): value is ExtractKind {
  return (
    value === 'links' ||
    value === 'main_text' ||
    value === 'selected_text' ||
    value === 'container_html'
  );
}

function normalizeWhat(what: ExtractWhatInput): NormalizedExtractWhat {
  switch (what.type) {
    case 'links': {
      const limit = clamp(what.limit, 1, 300, DEFAULT_LINK_LIMIT);
      const filter = typeof what.filter === 'string' ? what.filter.trim() : '';
      const normalized: ExtractWhatLinks = { type: 'links', limit };
      if (filter.length > 0) {
        normalized.filter = filter;
      }
      return normalized;
    }

    case 'main_text':
      return {
        type: 'main_text',
        maxChars: clamp(what.maxChars, 500, 50000, DEFAULT_MAIN_TEXT_MAX_CHARS),
      };

    case 'selected_text':
      return {
        type: 'selected_text',
        maxChars: DEFAULT_SELECTED_TEXT_MAX_CHARS,
      };

    case 'container_html': {
      const selector = what.selector.trim();
      if (!selector) {
        throw new Error('container_html selector cannot be empty');
      }
      return {
        type: 'container_html',
        selector,
        maxChars: clamp(what.maxChars, 500, 100000, DEFAULT_CONTAINER_HTML_MAX_CHARS),
      };
    }
  }
}

async function findActiveTab(
  client: ExtractChromeClient,
  windowId: number
): Promise<ChromeTab | undefined> {
  const activeTabs = await callChrome<ChromeTab[]>(client, 'tabs.query', {
    active: true,
    windowId,
  });
  if (activeTabs.length > 0) {
    return activeTabs[0];
  }

  const tabs = await callChrome<ChromeTab[]>(client, 'tabs.query', { windowId });
  return tabs[0];
}

async function getTargetTab(
  client: ExtractChromeClient,
  windowId: number,
  tabId: number | undefined
): Promise<ChromeTab> {
  if (typeof tabId === 'number') {
    const tab = await callChrome<ChromeTab>(client, 'tabs.get', tabId);
    if (tab.windowId !== windowId) {
      throw new Error(`Tab ${tabId} does not belong to window ${windowId}`);
    }
    return tab;
  }

  const activeTab = await findActiveTab(client, windowId);
  if (!activeTab) {
    throw new Error(`No tab found in window ${windowId}`);
  }

  return activeTab;
}

function buildExtractScript(payload: ExtractPayload): string {
  const serializedPayload = JSON.stringify(payload);
  return `
(() => {
  const payload = ${serializedPayload};

  const normalizeInline = (value, maxLength = 220) => {
    if (typeof value !== 'string') return '';
    const compact = value.replace(/\\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= maxLength) return compact;
    return compact.slice(0, Math.max(1, maxLength - 1)) + '…';
  };

  const normalizeBlock = (value) => {
    if (typeof value !== 'string') return '';
    return value
      .replace(/\\r/g, '')
      .split('\\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\\n');
  };

  const truncate = (value, maxChars) => {
    if (value.length <= maxChars) {
      return { text: value, truncated: false };
    }

    return {
      text: value.slice(0, Math.max(1, maxChars - 1)) + '…',
      truncated: true,
    };
  };

  const page = {
    url: location.href,
    title: document.title || '',
  };

  try {
    const warnings = [];
    const what = payload.what;

    if (what.type === 'links') {
      const filter = typeof what.filter === 'string' && what.filter
        ? what.filter.toLowerCase()
        : '';
      const candidates = Array.from(document.querySelectorAll('a[href]'));
      const seen = new Set();
      const links = [];

      for (const anchor of candidates) {
        const url = normalizeInline(anchor.href || '', 800);
        if (!url) continue;

        const text =
          normalizeInline(anchor.innerText || '', 180) ||
          normalizeInline(anchor.textContent || '', 180) ||
          normalizeInline(anchor.getAttribute('aria-label') || '', 180) ||
          '(no text)';

        if (filter) {
          const haystack = (text + ' ' + url).toLowerCase();
          if (!haystack.includes(filter)) {
            continue;
          }
        }

        const key = url + '|' + text;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        links.push({ text, url });
      }

      const totalCount = links.length;
      const limited = links.slice(0, what.limit);

      return {
        success: true,
        kind: what.type,
        page,
        totalCount,
        returnedCount: limited.length,
        truncated: totalCount > limited.length,
        links: limited,
        warnings,
      };
    }

    if (what.type === 'main_text') {
      const root =
        document.querySelector('main, article, [role="main"]') ||
        document.body ||
        document.documentElement;
      const clone = root.cloneNode(true);
      if (clone && typeof clone.querySelectorAll === 'function') {
        const ignored = clone.querySelectorAll('script, style, noscript, template');
        for (const node of ignored) {
          node.remove();
        }
      }

      const raw =
        typeof clone.innerText === 'string' && clone.innerText.trim()
          ? clone.innerText
          : clone.textContent || '';
      const normalized = normalizeBlock(raw);
      const truncated = truncate(normalized, what.maxChars);

      return {
        success: true,
        kind: what.type,
        page,
        totalCount: normalized.length,
        returnedCount: truncated.text.length,
        truncated: truncated.truncated,
        text: truncated.text,
        warnings,
      };
    }

    if (what.type === 'selected_text') {
      const selectedRaw =
        typeof window.getSelection === 'function'
          ? window.getSelection()?.toString() || ''
          : '';
      const normalized = normalizeBlock(selectedRaw);
      const truncated = truncate(normalized, what.maxChars);

      if (!normalized) {
        warnings.push('No selected text found on the page.');
      }

      return {
        success: true,
        kind: what.type,
        page,
        totalCount: normalized.length,
        returnedCount: truncated.text.length,
        truncated: truncated.truncated,
        text: truncated.text,
        warnings,
      };
    }

    if (what.type === 'container_html') {
      let container = null;
      try {
        container = document.querySelector(what.selector);
      } catch {
        throw new Error('Invalid CSS selector: ' + what.selector);
      }

      if (!container) {
        throw new Error('No element found for selector: ' + what.selector);
      }

      const html = String(container.outerHTML || '');
      const truncated = truncate(html, what.maxChars);

      return {
        success: true,
        kind: what.type,
        page,
        totalCount: html.length,
        returnedCount: truncated.text.length,
        truncated: truncated.truncated,
        text: truncated.text,
        selector: what.selector,
        warnings,
      };
    }

    throw new Error('Unsupported extract mode');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      kind: payload.what.type,
      page,
      totalCount: 0,
      returnedCount: 0,
      truncated: false,
      warnings: [],
      message,
    };
  }
})()
`.trim();
}

function parseExtractResult(raw: unknown): ExtractScriptResult {
  if (!isObject(raw)) {
    throw new Error('Extract returned an invalid payload');
  }

  if (typeof raw.success !== 'boolean') {
    throw new Error('Extract payload is missing success');
  }
  if (!isExtractKind(raw.kind)) {
    throw new Error('Extract payload contains invalid kind');
  }
  if (
    !isObject(raw.page) ||
    typeof raw.page.url !== 'string' ||
    typeof raw.page.title !== 'string'
  ) {
    throw new Error('Extract payload is missing page metadata');
  }
  if (typeof raw.totalCount !== 'number' || typeof raw.returnedCount !== 'number') {
    throw new Error('Extract payload is missing count metadata');
  }
  if (typeof raw.truncated !== 'boolean') {
    throw new Error('Extract payload is missing truncation metadata');
  }
  if (!Array.isArray(raw.warnings)) {
    throw new Error('Extract payload is missing warnings');
  }

  const parsedWarnings = raw.warnings.filter((w): w is string => typeof w === 'string');
  const base: ExtractScriptResult = {
    success: raw.success,
    kind: raw.kind,
    page: {
      url: raw.page.url,
      title: raw.page.title,
    },
    totalCount: raw.totalCount,
    returnedCount: raw.returnedCount,
    truncated: raw.truncated,
    warnings: parsedWarnings,
  };

  if (raw.kind === 'links') {
    if (!Array.isArray(raw.links)) {
      throw new Error('Extract links payload is missing links');
    }

    const parsedLinks: ExtractLink[] = raw.links
      .filter((link): link is Record<string, unknown> => isObject(link))
      .filter(
        (link): link is { text: string; url: string } =>
          typeof link.text === 'string' && typeof link.url === 'string'
      )
      .map((link) => ({ text: link.text, url: link.url }));

    base.links = parsedLinks;
  } else {
    if (typeof raw.text === 'string') {
      base.text = raw.text;
    } else if (raw.success) {
      base.text = '';
    }

    if (raw.kind === 'container_html' && typeof raw.selector === 'string') {
      base.selector = raw.selector;
    }
  }

  if (!raw.success && typeof raw.message === 'string') {
    base.message = raw.message;
  }

  return base;
}

function formatExtractContent(details: ExtractToolDetails): string {
  const lines: string[] = [];
  lines.push(`Extract kind: ${details.kind}`);
  lines.push(`Tab: ${details.tab.tabId}`);
  lines.push(`URL: ${details.tab.url || '(empty)'}`);
  lines.push(
    `Counts: returned=${details.returnedCount}, total=${details.totalCount}, truncated=${details.truncated}`
  );
  lines.push('');

  if (details.kind === 'links') {
    lines.push('Links:');
    if (!details.links?.length) {
      lines.push('- (none)');
    } else {
      for (const link of details.links) {
        lines.push(`- ${link.text}`);
        lines.push(`  ${link.url}`);
      }
    }
  } else if (details.kind === 'container_html') {
    lines.push(`Selector: ${details.selector ?? '(unknown)'}`);
    lines.push('');
    lines.push('```html');
    lines.push(details.text ?? '');
    lines.push('```');
  } else {
    lines.push(details.text ?? '');
  }

  if (details.warnings?.length) {
    lines.push('');
    lines.push(`Warnings: ${details.warnings.join(' | ')}`);
  }

  return lines.join('\n');
}

export function createExtractTool(options: ExtractToolOptions): AgentTool<typeof extractSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw new Error('createExtractTool requires a positive integer windowId');
  }

  const windowId = options.windowId;
  const getClient = options.operations?.getClient ?? createDefaultGetClient(options.connectOptions);

  return {
    name: 'extract',
    label: 'extract',
    description:
      'Extract focused page content without full snapshots. Modes: links (optional filter), main_text, selected_text, container_html.',
    parameters: extractSchema,
    execute: async (_toolCallId: string, input: ExtractToolInput) => {
      const client = await getClient();
      const normalizedWhat = normalizeWhat(input.what);

      const targetTab = await getTargetTab(client, windowId, input.tabId);
      const targetTabId = targetTab.id;
      if (typeof targetTabId !== 'number') {
        throw new Error('Target tab id is missing');
      }

      await callChrome<ChromeTab>(client, 'tabs.update', targetTabId, { active: true });
      await callChrome<unknown>(client, 'windows.update', windowId, { focused: true });

      const script = buildExtractScript({ what: normalizedWhat });
      const evaluation = await callChrome<DebuggerEvaluateResult>(client, 'debugger.evaluate', {
        tabId: targetTabId,
        code: script,
      });
      const extraction = parseExtractResult(evaluation.result);

      if (!extraction.success) {
        throw new Error(extraction.message ?? `extract ${extraction.kind} failed`);
      }

      const refreshedTab = await callChrome<ChromeTab>(client, 'tabs.get', targetTabId);
      const tab = toExtractTab(refreshedTab);

      const detailsBase: ExtractToolDetails = {
        tab,
        windowId,
        kind: extraction.kind,
        what: input.what,
        totalCount: extraction.totalCount,
        returnedCount: extraction.returnedCount,
        truncated: extraction.truncated,
        ...(extraction.links ? { links: extraction.links } : {}),
        ...(extraction.text !== undefined ? { text: extraction.text } : {}),
        ...(extraction.selector !== undefined ? { selector: extraction.selector } : {}),
      };

      const details: ExtractToolDetails =
        extraction.warnings.length > 0
          ? { ...detailsBase, warnings: extraction.warnings }
          : detailsBase;

      return {
        content: [{ type: 'text', content: formatExtractContent(details) }],
        details,
      };
    },
  };
}
