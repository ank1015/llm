import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import type { AgentTool } from '@ank1015/llm-sdk';

const inspectSchema = Type.Object({
  tabId: Type.Optional(
    Type.Number({
      description:
        'Optional tab id to inspect. If omitted, inspects the active tab in the scoped window.',
    })
  ),
  maxInteractive: Type.Optional(
    Type.Number({
      description: 'Maximum interactive elements to return (default: 120, range: 20-300).',
    })
  ),
  maxTextBlocks: Type.Optional(
    Type.Number({
      description: 'Maximum text blocks to return (default: 40, range: 10-120).',
    })
  ),
  includeOffscreen: Type.Optional(
    Type.Boolean({
      description:
        'Include offscreen elements (default: false). If false, keeps only elements in viewport.',
    })
  ),
  includeHidden: Type.Optional(
    Type.Boolean({
      description:
        'Include hidden elements (default: false). If false, keeps only visible elements.',
    })
  ),
});

export type InspectToolInput = Static<typeof inspectSchema>;

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
  active?: boolean;
}

interface InspectChromeClient {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export interface InspectTab {
  tabId: number;
  url: string;
  title: string;
}

export interface InspectPageInfo {
  url: string;
  title: string;
  lang: string;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  scroll: {
    x: number;
    y: number;
    maxY: number;
  };
}

export interface InspectPageSummary {
  interactiveCount: number;
  totalInteractiveCount: number;
  textBlockCount: number;
  totalTextBlockCount: number;
  formCount: number;
  alertCount: number;
  totalLinks: number;
  totalButtons: number;
  totalInputs: number;
}

export interface InspectLocator {
  id?: string;
  testId?: string;
  name?: string;
  role?: string;
  cssPath?: string;
}

export interface InspectBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InspectInteractiveElement {
  id: string;
  tag: string;
  role: string;
  name: string;
  actions: string[];
  state: string[];
  locator: InspectLocator;
  bbox: InspectBBox;
  href?: string;
}

export interface InspectTextBlock {
  id: string;
  kind: 'heading' | 'text';
  text: string;
  source: string;
  level?: number;
}

export interface InspectFormSummary {
  id: string;
  name: string;
  fields: string[];
  submitButtons: string[];
}

export interface InspectTruncation {
  interactive: boolean;
  textBlocks: boolean;
  hiddenFilteredCount: number;
  offscreenFilteredCount: number;
}

interface InspectSnapshot {
  page: InspectPageInfo;
  summary: InspectPageSummary;
  interactive: InspectInteractiveElement[];
  textBlocks: InspectTextBlock[];
  forms: InspectFormSummary[];
  alerts: string[];
  truncation: InspectTruncation;
  warnings: string[];
}

export interface InspectToolDetails {
  tab: InspectTab;
  windowId: number;
  page: InspectPageInfo;
  summary: InspectPageSummary;
  interactive: InspectInteractiveElement[];
  textBlocks: InspectTextBlock[];
  forms: InspectFormSummary[];
  alerts: string[];
  truncation: InspectTruncation;
  warnings?: string[];
}

export interface InspectOperations {
  getClient: () => Promise<InspectChromeClient>;
}

export interface InspectToolOptions {
  /** Browser window scope used for all operations in this tool instance */
  windowId: number;
  /** Options passed to @ank1015/llm-extension connect() */
  connectOptions?: ConnectOptions;
  /** Custom operations for testing or alternative transports */
  operations?: InspectOperations;
}

interface ScriptOptions {
  maxInteractive: number;
  maxTextBlocks: number;
  includeOffscreen: boolean;
  includeHidden: boolean;
}

interface DebuggerEvaluateResult {
  result?: unknown;
}

const DEFAULT_MAX_INTERACTIVE = 120;
const DEFAULT_MAX_TEXT_BLOCKS = 40;

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function normalizeScriptOptions(input: InspectToolInput): ScriptOptions {
  return {
    maxInteractive: clamp(input.maxInteractive, 20, 300, DEFAULT_MAX_INTERACTIVE),
    maxTextBlocks: clamp(input.maxTextBlocks, 10, 120, DEFAULT_MAX_TEXT_BLOCKS),
    includeOffscreen: input.includeOffscreen ?? false,
    includeHidden: input.includeHidden ?? false,
  };
}

function createDefaultGetClient(
  connectOptions?: ConnectOptions
): () => Promise<InspectChromeClient> {
  let clientPromise: Promise<InspectChromeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = connect({ launch: true, ...connectOptions });
    }
    return clientPromise;
  };
}

async function callChrome<T>(
  client: InspectChromeClient,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return (await client.call(method, ...args)) as T;
}

function toInspectTab(tab: ChromeTab): InspectTab {
  if (typeof tab.id !== 'number') {
    throw new Error('Chrome tab response did not include a numeric tab id');
  }

  return {
    tabId: tab.id,
    url: tab.url ?? '',
    title: tab.title ?? '',
  };
}

async function findActiveTab(
  client: InspectChromeClient,
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
  client: InspectChromeClient,
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

function normalizeLine(value: string, max = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, Math.max(1, max - 1))}…`;
}

function getLocatorText(locator: InspectLocator): string {
  if (locator.testId) {
    return `[data-testid="${locator.testId}"]`;
  }
  if (locator.id) {
    return `#${locator.id}`;
  }
  if (locator.name) {
    return `[name="${locator.name}"]`;
  }
  if (locator.cssPath) {
    return locator.cssPath;
  }
  if (locator.role) {
    return `[role="${locator.role}"]`;
  }
  return '(none)';
}

function renderMarkdown(details: InspectToolDetails): string {
  const lines: string[] = [];
  lines.push('# Page Snapshot');
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Title: ${normalizeLine(details.page.title, 160) || '(untitled)'}`);
  lines.push(`- URL: ${details.page.url || '(empty)'}`);
  lines.push(`- Lang: ${details.page.lang || '(unknown)'}`);
  lines.push(
    `- Viewport: ${details.page.viewport.width}x${details.page.viewport.height}, scroll=(${details.page.scroll.x}, ${details.page.scroll.y}/${details.page.scroll.maxY})`
  );
  lines.push(`- Captured At: ${details.page.capturedAt}`);
  lines.push(
    `- Interactive: ${details.summary.interactiveCount}/${details.summary.totalInteractiveCount}, Text Blocks: ${details.summary.textBlockCount}/${details.summary.totalTextBlockCount}, Forms: ${details.summary.formCount}, Alerts: ${details.summary.alertCount}`
  );
  lines.push(
    `- Totals: links=${details.summary.totalLinks}, buttons=${details.summary.totalButtons}, inputs=${details.summary.totalInputs}`
  );
  lines.push('');

  lines.push('## Key Text');
  if (details.textBlocks.length === 0) {
    lines.push('- (none)');
  } else {
    for (const block of details.textBlocks) {
      const levelSuffix = block.level ? ` h${block.level}` : '';
      lines.push(
        `- **${block.id}** [${block.kind}${levelSuffix}] ${normalizeLine(block.text, 260)}`
      );
    }
  }
  lines.push('');

  lines.push('## Interactive Elements');
  if (details.interactive.length === 0) {
    lines.push('- (none)');
  } else {
    for (const element of details.interactive) {
      const roleText = element.role ? ` role=${element.role}` : '';
      const stateText = element.state.length > 0 ? element.state.join(', ') : 'none';
      const hrefText = element.href ? ` href=${normalizeLine(element.href, 120)}` : '';
      lines.push(
        `- **${element.id}** \`${element.tag}${roleText}\` "${normalizeLine(element.name || '(unnamed)', 120)}" | actions=${element.actions.join(', ')} | state=${stateText} | locator=${normalizeLine(getLocatorText(element.locator), 120)} | box=(${element.bbox.x},${element.bbox.y},${element.bbox.width}x${element.bbox.height})${hrefText}`
      );
    }
  }
  lines.push('');

  lines.push('## Forms');
  if (details.forms.length === 0) {
    lines.push('- (none)');
  } else {
    for (const form of details.forms) {
      const fieldText = form.fields.length > 0 ? form.fields.join(', ') : '(none)';
      const submitText = form.submitButtons.length > 0 ? form.submitButtons.join(', ') : '(none)';
      lines.push(
        `- **${form.id}** ${normalizeLine(form.name || '(unnamed)', 100)} | fields=${normalizeLine(fieldText, 180)} | submit=${normalizeLine(submitText, 120)}`
      );
    }
  }
  lines.push('');

  lines.push('## Alerts');
  if (details.alerts.length === 0) {
    lines.push('- (none)');
  } else {
    for (const alert of details.alerts) {
      lines.push(`- ${normalizeLine(alert, 240)}`);
    }
  }
  lines.push('');

  lines.push('## Notes');
  const notes: string[] = [];
  if (details.truncation.interactive) {
    notes.push(
      `Interactive elements truncated (${details.summary.interactiveCount}/${details.summary.totalInteractiveCount}).`
    );
  }
  if (details.truncation.textBlocks) {
    notes.push(
      `Text blocks truncated (${details.summary.textBlockCount}/${details.summary.totalTextBlockCount}).`
    );
  }
  if (details.truncation.hiddenFilteredCount > 0) {
    notes.push(`${details.truncation.hiddenFilteredCount} hidden elements were excluded.`);
  }
  if (details.truncation.offscreenFilteredCount > 0) {
    notes.push(`${details.truncation.offscreenFilteredCount} offscreen elements were excluded.`);
  }
  if (details.warnings?.length) {
    notes.push(...details.warnings);
  }

  if (notes.length === 0) {
    lines.push('- No truncation warnings.');
  } else {
    for (const note of notes) {
      lines.push(`- ${normalizeLine(note, 260)}`);
    }
  }

  return lines.join('\n');
}

function buildInspectScript(options: ScriptOptions): string {
  const serializedOptions = JSON.stringify(options);
  return `
(() => {
  const options = ${serializedOptions};

  const textSeen = new Set();

  const normalizeText = (value, maxLength) => {
    if (typeof value !== 'string') return '';
    const compact = value.replace(/\\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= maxLength) return compact;
    return compact.slice(0, Math.max(1, maxLength - 1)) + '…';
  };

  const toInt = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.round(value);
  };

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  };

  const getRectInfo = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: toInt(rect.left),
      y: toInt(rect.top),
      width: toInt(rect.width),
      height: toInt(rect.height),
      bottom: rect.bottom,
      right: rect.right,
      top: rect.top,
      left: rect.left,
    };
  };

  const getVisibility = (element) => {
    const rect = getRectInfo(element);
    const style = window.getComputedStyle(element);
    const hidden =
      element.hidden ||
      element.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity || '1') === 0 ||
      rect.width <= 0 ||
      rect.height <= 0;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const offscreen =
      rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth;

    return { hidden, offscreen, rect };
  };

  const getElementText = (element, maxLength = 220) => {
    const rawText =
      typeof element.innerText === 'string' && element.innerText.trim()
        ? element.innerText
        : element.textContent || '';
    return normalizeText(rawText, maxLength);
  };

  const getByLabelledBy = (element) => {
    const labelledBy = normalizeText(element.getAttribute('aria-labelledby') || '', 400);
    if (!labelledBy) return '';

    const parts = labelledBy
      .split(/\\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => getElementText(node, 80))
      .filter(Boolean);

    return normalizeText(parts.join(' '), 140);
  };

  const getLabelText = (element) => {
    const labels = [];

    if (element.id) {
      const forLabel = document.querySelector('label[for="' + cssEscape(element.id) + '"]');
      if (forLabel) {
        labels.push(getElementText(forLabel, 100));
      }
    }

    if (element.labels && element.labels.length) {
      for (const label of element.labels) {
        labels.push(getElementText(label, 100));
      }
    }

    if (typeof element.closest === 'function') {
      const parentLabel = element.closest('label');
      if (parentLabel) {
        labels.push(getElementText(parentLabel, 100));
      }
    }

    return labels.find(Boolean) || '';
  };

  const getName = (element) => {
    const ariaLabel = normalizeText(element.getAttribute('aria-label') || '', 140);
    if (ariaLabel) return ariaLabel;

    const labelledBy = getByLabelledBy(element);
    if (labelledBy) return labelledBy;

    const labelText = getLabelText(element);
    if (labelText) return labelText;

    const placeholder = normalizeText(element.getAttribute('placeholder') || '', 120);
    if (placeholder) return placeholder;

    const title = normalizeText(element.getAttribute('title') || '', 120);
    if (title) return title;

    const alt = normalizeText(element.getAttribute('alt') || '', 120);
    if (alt) return alt;

    if (typeof element.value === 'string' && element.value && element.type !== 'password') {
      return normalizeText(element.value, 100);
    }

    return getElementText(element, 140);
  };

  const getRole = (element) => normalizeText(element.getAttribute('role') || '', 40);

  const getActions = (element) => {
    const actions = [];
    const tag = element.tagName.toLowerCase();
    const type = normalizeText(element.getAttribute('type') || '', 40).toLowerCase();
    const role = getRole(element);

    const addAction = (action) => {
      if (!actions.includes(action)) actions.push(action);
    };

    if (tag === 'a' && element.getAttribute('href')) addAction('click');
    if (tag === 'button') addAction('click');
    if (tag === 'select') addAction('select');
    if (tag === 'textarea') addAction('type');
    if (element.isContentEditable) addAction('type');

    if (tag === 'input') {
      if (type === 'checkbox' || type === 'radio') addAction('toggle');
      else if (type === 'file') addAction('upload');
      else if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image')
        addAction('click');
      else addAction('type');
    }

    if (
      role === 'button' ||
      role === 'link' ||
      role === 'menuitem' ||
      role === 'tab' ||
      role === 'option'
    ) {
      addAction('click');
    }
    if (role === 'checkbox' || role === 'radio' || role === 'switch') {
      addAction('toggle');
    }

    if (element.hasAttribute('onclick')) addAction('click');

    return actions;
  };

  const getState = (element) => {
    const state = [];
    const addState = (value) => {
      if (!state.includes(value)) state.push(value);
    };

    if (typeof element.disabled === 'boolean' && element.disabled) addState('disabled');
    if (typeof element.readOnly === 'boolean' && element.readOnly) addState('readonly');
    if (typeof element.required === 'boolean' && element.required) addState('required');
    if (typeof element.checked === 'boolean' && element.checked) addState('checked');
    if (element.getAttribute('aria-expanded') === 'true') addState('expanded');
    if (element.getAttribute('aria-expanded') === 'false') addState('collapsed');
    if (element.getAttribute('aria-invalid') === 'true') addState('invalid');
    if (typeof element.checkValidity === 'function') {
      try {
        if (!element.checkValidity()) addState('invalid');
      } catch {}
    }

    return state;
  };

  const buildCssPath = (element) => {
    if (element.id) {
      return '#' + cssEscape(element.id);
    }

    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 6) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += '#' + cssEscape(current.id);
        parts.unshift(selector);
        break;
      }

      const classNames =
        typeof current.className === 'string'
          ? current.className
              .split(/\\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((name) => '.' + cssEscape(name))
              .join('')
          : '';
      if (classNames) {
        selector += classNames;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (candidate) => candidate.tagName === current.tagName
        );
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }

      parts.unshift(selector);
      current = parent;
      depth += 1;
    }

    return parts.join(' > ');
  };

  const getLocator = (element) => {
    const locator = {};
    const role = getRole(element);
    const id = normalizeText(element.getAttribute('id') || '', 120);
    const testId = normalizeText(
      element.getAttribute('data-testid') ||
        element.getAttribute('data-test-id') ||
        element.getAttribute('data-test') ||
        element.getAttribute('data-qa') ||
        '',
      120
    );
    const name = normalizeText(element.getAttribute('name') || '', 120);

    if (id) locator.id = id;
    if (testId) locator.testId = testId;
    if (name) locator.name = name;
    if (role) locator.role = role;

    const cssPath = buildCssPath(element);
    if (cssPath) locator.cssPath = cssPath;

    return locator;
  };

  const sortByPosition = (a, b) => {
    if (a.bbox.y !== b.bbox.y) return a.bbox.y - b.bbox.y;
    if (a.bbox.x !== b.bbox.x) return a.bbox.x - b.bbox.x;
    return a.tag.localeCompare(b.tag);
  };

  const interactiveSelectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const interactiveCandidates = Array.from(document.querySelectorAll(interactiveSelectors));
  const uniqueCandidates = Array.from(new Set(interactiveCandidates));

  let hiddenFilteredCount = 0;
  let offscreenFilteredCount = 0;
  const interactiveRows = [];

  for (const element of uniqueCandidates) {
    const visibility = getVisibility(element);
    if (!options.includeHidden && visibility.hidden) {
      hiddenFilteredCount += 1;
      continue;
    }
    if (!options.includeOffscreen && visibility.offscreen) {
      offscreenFilteredCount += 1;
      continue;
    }

    const actions = getActions(element);
    if (actions.length === 0) continue;

    const tag = element.tagName.toLowerCase();
    const role = getRole(element);
    const name = getName(element);
    const state = getState(element);
    const locator = getLocator(element);
    const bbox = {
      x: visibility.rect.x,
      y: visibility.rect.y,
      width: visibility.rect.width,
      height: visibility.rect.height,
    };

    const row = {
      tag,
      role,
      name,
      actions,
      state,
      locator,
      bbox,
    };

    if (tag === 'a') {
      const href = normalizeText(element.getAttribute('href') || '', 320);
      if (href) row.href = href;
    }

    interactiveRows.push(row);
  }

  interactiveRows.sort(sortByPosition);
  const totalInteractiveCount = interactiveRows.length;
  const interactive = interactiveRows.slice(0, options.maxInteractive).map((row, index) => ({
    id: 'E' + (index + 1),
    ...row,
  }));

  const textBlocks = [];
  const addTextBlock = (kind, text, source, level) => {
    const normalized = normalizeText(text, 320);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (textSeen.has(key)) return;
    textSeen.add(key);

    const block = {
      id: 'T' + (textBlocks.length + 1),
      kind,
      text: normalized,
      source: normalizeText(source || '', 180),
    };

    if (typeof level === 'number') {
      block.level = level;
    }

    textBlocks.push(block);
  };

  const headingNodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  for (const heading of headingNodes) {
    const visibility = getVisibility(heading);
    if (!options.includeHidden && visibility.hidden) continue;
    if (!options.includeOffscreen && visibility.offscreen) continue;
    const level = Number.parseInt(heading.tagName.slice(1), 10);
    addTextBlock('heading', getElementText(heading, 280), buildCssPath(heading), level);
  }

  const textSelectors = [
    'main p',
    'article p',
    '[role="main"] p',
    'main li',
    'article li',
    '[role="main"] li',
    'section p',
    'p',
  ];
  const textCandidates = Array.from(document.querySelectorAll(textSelectors.join(',')));
  for (const node of textCandidates) {
    if (textBlocks.length >= options.maxTextBlocks * 2) break;
    const visibility = getVisibility(node);
    if (!options.includeHidden && visibility.hidden) continue;
    if (!options.includeOffscreen && visibility.offscreen) continue;

    const text = getElementText(node, 320);
    if (!text || text.length < 35) continue;
    addTextBlock('text', text, buildCssPath(node));
  }

  const totalTextBlockCount = textBlocks.length;
  const trimmedTextBlocks = textBlocks.slice(0, options.maxTextBlocks);

  const forms = [];
  const formNodes = Array.from(document.querySelectorAll('form'));
  for (const formNode of formNodes) {
    const visibility = getVisibility(formNode);
    if (!options.includeHidden && visibility.hidden) continue;
    if (!options.includeOffscreen && visibility.offscreen) continue;

    const fieldNodes = Array.from(formNode.querySelectorAll('input, select, textarea'));
    const fields = [];
    for (const field of fieldNodes) {
      const type = normalizeText(field.getAttribute('type') || '', 40).toLowerCase();
      if (type === 'hidden') continue;
      const fieldName =
        getName(field) ||
        normalizeText(field.getAttribute('name') || '', 80) ||
        normalizeText(field.getAttribute('id') || '', 80) ||
        normalizeText(field.tagName.toLowerCase(), 40);
      if (fieldName && !fields.includes(fieldName)) fields.push(fieldName);
    }

    const submitNodes = Array.from(
      formNode.querySelectorAll(
        'button[type="submit"], button:not([type]), input[type="submit"], input[type="image"]'
      )
    );
    const submitButtons = [];
    for (const submitNode of submitNodes) {
      const submitName = getName(submitNode) || normalizeText(submitNode.tagName.toLowerCase(), 40);
      if (submitName && !submitButtons.includes(submitName)) {
        submitButtons.push(submitName);
      }
    }

    const formName =
      normalizeText(formNode.getAttribute('aria-label') || '', 100) ||
      normalizeText(formNode.getAttribute('name') || '', 100) ||
      normalizeText(formNode.getAttribute('id') || '', 100) ||
      normalizeText(getElementText(formNode.querySelector('h1, h2, h3, legend') || formNode, 100), 100) ||
      'form';

    forms.push({
      id: 'F' + (forms.length + 1),
      name: formName,
      fields,
      submitButtons,
    });
  }

  const alerts = [];
  const addAlert = (text) => {
    const normalized = normalizeText(text, 240);
    if (!normalized) return;
    if (!alerts.includes(normalized)) alerts.push(normalized);
  };

  const alertNodes = Array.from(
    document.querySelectorAll(
      '[role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]'
    )
  );
  for (const alertNode of alertNodes) {
    const visibility = getVisibility(alertNode);
    if (!options.includeHidden && visibility.hidden) continue;
    if (!options.includeOffscreen && visibility.offscreen) continue;
    addAlert(getElementText(alertNode, 240));
  }

  const checkableNodes = Array.from(document.querySelectorAll('input, select, textarea'));
  for (const node of checkableNodes) {
    if (typeof node.checkValidity !== 'function') continue;
    try {
      if (!node.checkValidity()) {
        const prefix = getName(node);
        const validationMessage = normalizeText(node.validationMessage || '', 180);
        if (validationMessage) {
          addAlert(prefix ? prefix + ': ' + validationMessage : validationMessage);
        }
      }
    } catch {}
  }

  const warnings = [];
  const iframeCount = document.querySelectorAll('iframe').length;
  if (iframeCount > 0) {
    warnings.push('Iframe contents are not expanded in this snapshot.');
  }

  const page = {
    url: location.href,
    title: document.title || '',
    lang: document.documentElement.lang || '',
    capturedAt: new Date().toISOString(),
    viewport: {
      width: toInt(window.innerWidth || document.documentElement.clientWidth || 0),
      height: toInt(window.innerHeight || document.documentElement.clientHeight || 0),
    },
    scroll: {
      x: toInt(window.scrollX || window.pageXOffset || 0),
      y: toInt(window.scrollY || window.pageYOffset || 0),
      maxY: toInt(
        Math.max(
          0,
          (document.documentElement.scrollHeight || 0) -
            (window.innerHeight || document.documentElement.clientHeight || 0)
        )
      ),
    },
  };

  const summary = {
    interactiveCount: interactive.length,
    totalInteractiveCount,
    textBlockCount: trimmedTextBlocks.length,
    totalTextBlockCount,
    formCount: forms.length,
    alertCount: alerts.length,
    totalLinks: document.querySelectorAll('a[href]').length,
    totalButtons: document.querySelectorAll('button, input[type="button"], input[type="submit"]').length,
    totalInputs: document.querySelectorAll('input, select, textarea, [contenteditable="true"], [contenteditable=""]').length,
  };

  const truncation = {
    interactive: totalInteractiveCount > interactive.length,
    textBlocks: totalTextBlockCount > trimmedTextBlocks.length,
    hiddenFilteredCount,
    offscreenFilteredCount,
  };

  return {
    page,
    summary,
    interactive,
    textBlocks: trimmedTextBlocks,
    forms,
    alerts: alerts.slice(0, 25),
    truncation,
    warnings,
  };
})()
`.trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSnapshot(raw: unknown): InspectSnapshot {
  if (!isObject(raw)) {
    throw new Error('Page inspection returned an invalid payload');
  }

  const { page, summary, interactive, textBlocks, forms, alerts, truncation, warnings } =
    raw as Partial<InspectSnapshot>;

  if (
    !page ||
    !summary ||
    !Array.isArray(interactive) ||
    !Array.isArray(textBlocks) ||
    !Array.isArray(forms) ||
    !Array.isArray(alerts) ||
    !truncation
  ) {
    throw new Error('Page inspection payload is missing required fields');
  }

  return {
    page,
    summary,
    interactive,
    textBlocks,
    forms,
    alerts,
    truncation,
    warnings: Array.isArray(warnings)
      ? warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
}

export function createInspectTool(options: InspectToolOptions): AgentTool<typeof inspectSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw new Error('createInspectTool requires a positive integer windowId');
  }

  const windowId = options.windowId;
  const getClient = options.operations?.getClient ?? createDefaultGetClient(options.connectOptions);

  return {
    name: 'inspect_page',
    label: 'inspect_page',
    description:
      'Inspect the current page and return a compact snapshot with key text, forms, alerts, and interactive elements for planning next actions.',
    parameters: inspectSchema,
    execute: async (_toolCallId: string, input: InspectToolInput) => {
      const client = await getClient();
      const scriptOptions = normalizeScriptOptions(input);

      const targetTab = await getTargetTab(client, windowId, input.tabId);
      const targetTabId = targetTab.id;
      if (typeof targetTabId !== 'number') {
        throw new Error('Target tab id is missing');
      }

      await callChrome<ChromeTab>(client, 'tabs.update', targetTabId, { active: true });
      await callChrome<unknown>(client, 'windows.update', windowId, { focused: true });

      const script = buildInspectScript(scriptOptions);
      const evaluation = await callChrome<DebuggerEvaluateResult>(client, 'debugger.evaluate', {
        tabId: targetTabId,
        code: script,
      });

      const snapshot = parseSnapshot(evaluation.result);
      const refreshedTab = await callChrome<ChromeTab>(client, 'tabs.get', targetTabId);
      const tab = toInspectTab(refreshedTab);

      const detailsBase: InspectToolDetails = {
        tab,
        windowId,
        page: snapshot.page,
        summary: snapshot.summary,
        interactive: snapshot.interactive,
        textBlocks: snapshot.textBlocks,
        forms: snapshot.forms,
        alerts: snapshot.alerts,
        truncation: snapshot.truncation,
      };

      const details: InspectToolDetails =
        snapshot.warnings.length > 0
          ? { ...detailsBase, warnings: snapshot.warnings }
          : detailsBase;

      const markdown = renderMarkdown(details);

      return {
        content: [{ type: 'text', content: markdown }],
        details,
      };
    },
  };
}
