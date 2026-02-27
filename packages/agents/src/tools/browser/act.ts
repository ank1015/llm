import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import { createInspectTool, type InspectInteractiveElement } from './inspect.js';

import type { AgentTool } from '@ank1015/llm-sdk';


const actActionSchema = Type.Union([
  Type.Literal('click'),
  Type.Literal('type'),
  Type.Literal('clear'),
  Type.Literal('pressEnter'),
  Type.Literal('select'),
  Type.Literal('scroll'),
  Type.Literal('hover'),
  Type.Literal('focus'),
]);

export type ActAction = Static<typeof actActionSchema>;

const targetLocatorSchema = Type.Object({
  id: Type.Optional(Type.String()),
  testId: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  cssPath: Type.Optional(Type.String()),
});

const targetObjectSchema = Type.Object({
  selector: Type.Optional(Type.String({ description: 'CSS selector' })),
  id: Type.Optional(
    Type.String({
      description:
        'Element id without # prefix. If this is the only target field and value looks like E<number>, it resolves using inspect_page element ids.',
    })
  ),
  testId: Type.Optional(Type.String({ description: 'data-testid or similar test id value' })),
  name: Type.Optional(Type.String({ description: 'Element name attribute' })),
  role: Type.Optional(Type.String({ description: 'ARIA role, e.g. button, link' })),
  text: Type.Optional(Type.String({ description: 'Visible text or accessible name matcher' })),
  href: Type.Optional(Type.String({ description: 'Link href matcher for anchor elements' })),
  index: Type.Optional(
    Type.Number({
      description: '0-based index when multiple elements match the same target query',
    })
  ),
  locator: Type.Optional(targetLocatorSchema),
});

const scrollValueSchema = Type.Object({
  x: Type.Optional(Type.Number({ description: 'Horizontal scroll delta in pixels' })),
  y: Type.Optional(Type.Number({ description: 'Vertical scroll delta in pixels' })),
  to: Type.Optional(
    Type.Union([
      Type.Literal('top'),
      Type.Literal('bottom'),
      Type.Literal('left'),
      Type.Literal('right'),
    ])
  ),
});

const actSchema = Type.Object({
  tabId: Type.Optional(
    Type.Number({
      description:
        'Optional tab id to act on. If omitted, acts on the active tab in the scoped window.',
    })
  ),
  type: actActionSchema,
  target: Type.Optional(
    Type.Union([
      Type.String({
        description: 'Target CSS selector or inspect_page element id (for example: E1).',
      }),
      targetObjectSchema,
    ])
  ),
  value: Type.Optional(
    Type.Union([
      Type.String({
        description:
          'Value for type/select actions. For select, can be option value or visible label.',
      }),
      Type.Number({
        description: 'Numeric scroll amount (pixels) when type=scroll',
      }),
      scrollValueSchema,
    ])
  ),
  opts: Type.Optional(
    Type.Object({
      clearBeforeType: Type.Optional(
        Type.Boolean({
          description: 'For type action, clear current value before typing (default: true).',
        })
      ),
      pressEnter: Type.Optional(
        Type.Boolean({
          description: 'For type action, press Enter after setting value (default: false).',
        })
      ),
      scrollBehavior: Type.Optional(Type.Union([Type.Literal('auto'), Type.Literal('smooth')])),
      waitForNavigationMs: Type.Optional(
        Type.Number({
          description:
            'After action, wait up to this many ms for tab load status to settle (default: 3000 for click/pressEnter, else 0).',
        })
      ),
      delayMs: Type.Optional(
        Type.Number({
          description: 'Optional delay after action in milliseconds before returning.',
        })
      ),
    })
  ),
});

export type ActToolInput = Static<typeof actSchema>;
type ActTargetObject = Static<typeof targetObjectSchema>;
export type ActTarget = ActTargetObject | string;

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  status?: string;
  windowId?: number;
  active?: boolean;
}

interface ActChromeClient {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export interface ActTab {
  tabId: number;
  url: string;
  title: string;
}

export interface ActElementSummary {
  tag: string;
  role: string;
  name: string;
  selectorUsed: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ActExecutionScriptResult {
  success: boolean;
  action: ActAction;
  message: string;
  url: string;
  title: string;
  element?: ActElementSummary;
  value?: string;
  warnings: string[];
}

export interface ActToolDetails {
  action: ActAction;
  windowId: number;
  tab: ActTab;
  page: {
    url: string;
    title: string;
  };
  message: string;
  target?: ActTarget;
  value?: string;
  element?: ActElementSummary;
  warnings?: string[];
}

export interface ActOperations {
  getClient: () => Promise<ActChromeClient>;
}

export interface ActToolOptions {
  /** Browser window scope used for all operations in this tool instance */
  windowId: number;
  /** Options passed to @ank1015/llm-extension connect() */
  connectOptions?: ConnectOptions;
  /** Custom operations for testing or alternative transports */
  operations?: ActOperations;
}

interface NormalizedActOptions {
  clearBeforeType: boolean;
  pressEnter: boolean;
  scrollBehavior: 'auto' | 'smooth';
  waitForNavigationMs: number;
  delayMs: number;
}

interface ActPayload {
  type: ActAction;
  target?: ActTarget;
  value?: ActToolInput['value'];
  opts: NormalizedActOptions;
}

interface DebuggerEvaluateResult {
  result?: unknown;
}

const DEFAULT_WAIT_FOR_NAV_MS = 3000;
const INSPECT_ELEMENT_ID_PATTERN = /^E\d+$/u;

function createDefaultGetClient(connectOptions?: ConnectOptions): () => Promise<ActChromeClient> {
  let clientPromise: Promise<ActChromeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = connect({ launch: true, ...connectOptions });
    }
    return clientPromise;
  };
}

async function callChrome<T>(
  client: ActChromeClient,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return (await client.call(method, ...args)) as T;
}

function toActTab(tab: ChromeTab): ActTab {
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
  client: ActChromeClient,
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
  client: ActChromeClient,
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

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function getDefaultWaitMs(action: ActAction): number {
  if (action === 'click' || action === 'pressEnter') {
    return DEFAULT_WAIT_FOR_NAV_MS;
  }
  return 0;
}

function normalizeOptions(input: ActToolInput): NormalizedActOptions {
  const opts = input.opts;
  return {
    clearBeforeType: opts?.clearBeforeType ?? true,
    pressEnter: opts?.pressEnter ?? false,
    scrollBehavior: opts?.scrollBehavior ?? 'auto',
    waitForNavigationMs: clamp(opts?.waitForNavigationMs, 0, 30000, getDefaultWaitMs(input.type)),
    delayMs: clamp(opts?.delayMs, 0, 30000, 0),
  };
}

function requireValue(input: ActToolInput, name: string): void {
  if (input.value === undefined) {
    throw new Error(`Action "${input.type}" requires ${name}`);
  }
}

function validateInput(input: ActToolInput): void {
  if (
    (input.type === 'click' ||
      input.type === 'type' ||
      input.type === 'clear' ||
      input.type === 'pressEnter' ||
      input.type === 'select' ||
      input.type === 'hover' ||
      input.type === 'focus') &&
    !input.target
  ) {
    throw new Error(`Action "${input.type}" requires target`);
  }

  if (input.type === 'type') {
    requireValue(input, 'a string value');
    if (typeof input.value !== 'string') {
      throw new Error('Action "type" requires value to be a string');
    }
  }

  if (input.type === 'select') {
    requireValue(input, 'a string value');
    if (typeof input.value !== 'string') {
      throw new Error('Action "select" requires value to be a string');
    }
  }

  if (input.type === 'scroll' && input.value !== undefined) {
    const isNumber = typeof input.value === 'number';
    const isObject = typeof input.value === 'object' && input.value !== null;
    if (!isNumber && !isObject) {
      throw new Error('Action "scroll" value must be a number or object');
    }
  }
}

function normalizeInspectElementId(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  if (!INSPECT_ELEMENT_ID_PATTERN.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function hasOnlyIdTargetField(target: ActTargetObject): boolean {
  return (
    target.selector === undefined &&
    target.testId === undefined &&
    target.name === undefined &&
    target.role === undefined &&
    target.text === undefined &&
    target.href === undefined &&
    target.index === undefined &&
    target.locator === undefined
  );
}

function getInspectElementIdFromTarget(target: ActTarget | undefined): string | undefined {
  if (typeof target === 'string') {
    return normalizeInspectElementId(target);
  }

  if (!target || typeof target !== 'object') {
    return undefined;
  }

  if (!hasOnlyIdTargetField(target)) {
    return undefined;
  }

  if (typeof target.id !== 'string') {
    return undefined;
  }

  return normalizeInspectElementId(target.id);
}

function parseInspectInteractiveElements(details: unknown): InspectInteractiveElement[] {
  if (!isObject(details) || !Array.isArray(details.interactive)) {
    throw new Error('inspect_page did not return interactive elements');
  }

  return details.interactive.filter((element): element is InspectInteractiveElement => {
    return isObject(element) && typeof element.id === 'string' && isObject(element.locator);
  });
}

function toTargetFromInspectElement(element: InspectInteractiveElement): ActTargetObject {
  const target: ActTargetObject = {};

  if (element.locator.cssPath) {
    target.selector = element.locator.cssPath;
  }
  if (element.locator.id) {
    target.id = element.locator.id;
  }
  if (element.locator.testId) {
    target.testId = element.locator.testId;
  }
  if (element.locator.name) {
    target.name = element.locator.name;
  }
  const role = element.role || element.locator.role;
  if (role) {
    target.role = role;
  }
  if (element.name) {
    target.text = element.name;
  }
  if (element.href) {
    target.href = element.href;
  }

  const locator: ActTargetObject['locator'] = {};
  if (element.locator.id) {
    locator.id = element.locator.id;
  }
  if (element.locator.testId) {
    locator.testId = element.locator.testId;
  }
  if (element.locator.name) {
    locator.name = element.locator.name;
  }
  if (element.locator.role) {
    locator.role = element.locator.role;
  }
  if (element.locator.cssPath) {
    locator.cssPath = element.locator.cssPath;
  }
  if (Object.keys(locator).length > 0) {
    target.locator = locator;
  }

  if (Object.keys(target).length === 0) {
    target.text = element.id;
  }

  return target;
}

async function resolveTargetFromInspectElementId(
  inspectTool: ReturnType<typeof createInspectTool>,
  toolCallId: string,
  tabId: number,
  target: ActTarget | undefined
): Promise<ActTarget | undefined> {
  const inspectElementId = getInspectElementIdFromTarget(target);
  if (!inspectElementId) {
    return target;
  }

  const inspectResult = await inspectTool.execute(`${toolCallId}:inspect`, { tabId });
  const interactive = parseInspectInteractiveElements(inspectResult.details);
  const mapped = interactive.find((element) => element.id.toUpperCase() === inspectElementId);

  if (!mapped) {
    throw new Error(
      `Element id "${inspectElementId}" was not found in inspect_page snapshot for tab ${tabId}`
    );
  }

  return toTargetFromInspectElement(mapped);
}

function buildActScript(payload: ActPayload): string {
  const serializedPayload = JSON.stringify(payload);
  return `
(() => {
  const payload = ${serializedPayload};

  const normalizeText = (value, maxLength = 160) => {
    if (typeof value !== 'string') return '';
    const compact = value.replace(/\\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= maxLength) return compact;
    return compact.slice(0, Math.max(1, maxLength - 1)) + '…';
  };

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  };

  const toInt = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.round(value);
  };

  const getElementText = (element) => {
    const raw =
      typeof element.innerText === 'string' && element.innerText.trim()
        ? element.innerText
        : element.textContent || '';
    return normalizeText(raw, 160);
  };

  const getName = (element) => {
    const ariaLabel = normalizeText(element.getAttribute('aria-label') || '', 160);
    if (ariaLabel) return ariaLabel;

    const labelledBy = normalizeText(element.getAttribute('aria-labelledby') || '', 300);
    if (labelledBy) {
      const text = labelledBy
        .split(/\\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((el) => getElementText(el))
        .filter(Boolean)
        .join(' ');
      const normalized = normalizeText(text, 160);
      if (normalized) return normalized;
    }

    const placeholder = normalizeText(element.getAttribute('placeholder') || '', 120);
    if (placeholder) return placeholder;

    const title = normalizeText(element.getAttribute('title') || '', 120);
    if (title) return title;

    if (typeof element.value === 'string' && element.value && element.type !== 'password') {
      return normalizeText(element.value, 120);
    }

    return getElementText(element);
  };

  const getRole = (element) => normalizeText(element.getAttribute('role') || '', 40);

  const getElementSummary = (element, selectorUsed) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: getRole(element),
      name: getName(element),
      selectorUsed,
      bbox: {
        x: toInt(rect.left),
        y: toInt(rect.top),
        width: toInt(rect.width),
        height: toInt(rect.height),
      },
    };
  };

  const selectByIndex = (elements, indexValue) => {
    if (!elements.length) return undefined;
    const index = Number.isInteger(indexValue) ? Math.max(0, indexValue) : 0;
    return elements[index] || elements[0];
  };

  const buildSelectorCandidates = (target) => {
    const selectors = [];

    const add = (selector) => {
      if (typeof selector !== 'string') return;
      const trimmed = selector.trim();
      if (!trimmed) return;
      if (!selectors.includes(trimmed)) selectors.push(trimmed);
    };

    if (typeof target === 'string') {
      add(target);
      return selectors;
    }

    if (!target || typeof target !== 'object') {
      return selectors;
    }

    add(target.selector);
    if (target.locator && typeof target.locator === 'object') {
      add(target.locator.cssPath);
      if (target.locator.id) add('#' + cssEscape(target.locator.id));
      if (target.locator.testId) {
        add('[data-testid="' + cssEscape(target.locator.testId) + '"]');
        add('[data-test-id="' + cssEscape(target.locator.testId) + '"]');
        add('[data-test="' + cssEscape(target.locator.testId) + '"]');
        add('[data-qa="' + cssEscape(target.locator.testId) + '"]');
      }
      if (target.locator.name) {
        add('[name="' + cssEscape(target.locator.name) + '"]');
      }
    }

    if (target.id) add('#' + cssEscape(target.id));
    if (target.testId) {
      add('[data-testid="' + cssEscape(target.testId) + '"]');
      add('[data-test-id="' + cssEscape(target.testId) + '"]');
      add('[data-test="' + cssEscape(target.testId) + '"]');
      add('[data-qa="' + cssEscape(target.testId) + '"]');
    }
    if (target.name) {
      add('[name="' + cssEscape(target.name) + '"]');
      add('#' + cssEscape(target.name));
    }
    if (target.role) {
      add('[role="' + cssEscape(target.role) + '"]');
    }
    if (target.href) {
      add('a[href="' + cssEscape(target.href) + '"]');
      add('a[href*="' + cssEscape(target.href) + '"]');
    }

    return selectors;
  };

  const normalizeMatcher = (value) => normalizeText(value || '', 200).toLowerCase();

  const resolveElement = (target) => {
    const index = typeof target === 'object' && target !== null && Number.isInteger(target.index)
      ? Math.max(0, target.index)
      : 0;
    const selectorCandidates = buildSelectorCandidates(target);

    for (const selector of selectorCandidates) {
      try {
        const elements = Array.from(document.querySelectorAll(selector));
        const selected = selectByIndex(elements, index);
        if (selected) {
          return { element: selected, selectorUsed: selector };
        }
      } catch {
        // Ignore invalid selector and continue.
      }
    }

    if (target && typeof target === 'object') {
      const targetText = normalizeMatcher(target.text);
      const targetRole = normalizeMatcher(target.role);
      const candidates = Array.from(
        document.querySelectorAll(
          'a, button, input, select, textarea, [role], [contenteditable="true"], [tabindex]'
        )
      );

      const matched = candidates.filter((candidate) => {
        const role = normalizeMatcher(candidate.getAttribute('role') || '');
        const name = normalizeMatcher(getName(candidate));
        const text = normalizeMatcher(getElementText(candidate));

        const roleMatch = !targetRole || role === targetRole;
        const textMatch =
          !targetText ||
          name.includes(targetText) ||
          text.includes(targetText) ||
          normalizeMatcher(candidate.getAttribute('value') || '').includes(targetText);

        return roleMatch && textMatch;
      });

      const selected = selectByIndex(matched, index);
      if (selected) {
        const descriptor = targetRole && targetText
          ? '[role="' + targetRole + '" text*="' + targetText + '"]'
          : targetText
            ? '[text*="' + targetText + '"]'
            : '[role="' + targetRole + '"]';
        return { element: selected, selectorUsed: descriptor };
      }
    }

    return { element: undefined, selectorUsed: '' };
  };

  const focusElement = (element) => {
    if (typeof element.focus === 'function') {
      element.focus();
    }
  };

  const dispatchInputLikeEvents = (element) => {
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  };

  const setNativeInputValue = (element, value) => {
    const prototype = Object.getPrototypeOf(element);
    const descriptor =
      Object.getOwnPropertyDescriptor(prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  };

  const getValueText = (element) => {
    if (typeof element.value === 'string') {
      return element.value;
    }
    if (element.isContentEditable) {
      return normalizeText(element.textContent || '', 500);
    }
    if (element instanceof HTMLSelectElement) {
      const option = element.options[element.selectedIndex];
      return option ? option.value : '';
    }
    return '';
  };

  const pressEnter = (element) => {
    focusElement(element);
    const eventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    element.dispatchEvent(new KeyboardEvent('keyup', eventInit));

    const form =
      typeof element.closest === 'function' ? element.closest('form') : null;
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    }
  };

  const clickElement = (element) => {
    focusElement(element);
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    if (typeof element.click === 'function') {
      element.click();
    } else {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  };

  const hoverElement = (element) => {
    element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
  };

  const scrollElementIntoView = (element, behavior) => {
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
    }
  };

  try {
    const { type, target, value, opts } = payload;
    const warnings = [];

    if (type === 'scroll') {
      if (target) {
        const resolved = resolveElement(target);
        if (!resolved.element) {
          throw new Error('Target element not found for scroll');
        }
        scrollElementIntoView(resolved.element, opts.scrollBehavior);
        return {
          success: true,
          action: type,
          message: 'Scrolled target element into view',
          url: location.href,
          title: document.title || '',
          element: getElementSummary(resolved.element, resolved.selectorUsed),
          warnings,
        };
      }

      if (typeof value === 'number') {
        window.scrollBy({ top: value, behavior: opts.scrollBehavior });
        return {
          success: true,
          action: type,
          message: 'Scrolled page by ' + value + 'px',
          url: location.href,
          title: document.title || '',
          warnings,
        };
      }

      if (value && typeof value === 'object') {
        const x = typeof value.x === 'number' ? value.x : 0;
        const y = typeof value.y === 'number' ? value.y : 0;
        if (value.to === 'top') {
          window.scrollTo({ top: 0, behavior: opts.scrollBehavior });
          return {
            success: true,
            action: type,
            message: 'Scrolled page to top',
            url: location.href,
            title: document.title || '',
            warnings,
          };
        }
        if (value.to === 'bottom') {
          window.scrollTo({
            top: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            behavior: opts.scrollBehavior,
          });
          return {
            success: true,
            action: type,
            message: 'Scrolled page to bottom',
            url: location.href,
            title: document.title || '',
            warnings,
          };
        }
        if (value.to === 'left') {
          window.scrollTo({ left: 0, behavior: opts.scrollBehavior });
          return {
            success: true,
            action: type,
            message: 'Scrolled page to left edge',
            url: location.href,
            title: document.title || '',
            warnings,
          };
        }
        if (value.to === 'right') {
          window.scrollTo({
            left: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            behavior: opts.scrollBehavior,
          });
          return {
            success: true,
            action: type,
            message: 'Scrolled page to right edge',
            url: location.href,
            title: document.title || '',
            warnings,
          };
        }
        window.scrollBy({ left: x, top: y, behavior: opts.scrollBehavior });
        return {
          success: true,
          action: type,
          message: 'Scrolled page by x=' + x + ' y=' + y,
          url: location.href,
          title: document.title || '',
          warnings,
        };
      }

      window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: opts.scrollBehavior });
      return {
        success: true,
        action: type,
        message: 'Scrolled page down by ~80% viewport',
        url: location.href,
        title: document.title || '',
        warnings,
      };
    }

    const resolved = resolveElement(target);
    const element = resolved.element;
    if (!element) {
      throw new Error('Target element not found');
    }

    scrollElementIntoView(element, opts.scrollBehavior);
    const summary = getElementSummary(element, resolved.selectorUsed);

    if (type === 'focus') {
      focusElement(element);
      return {
        success: true,
        action: type,
        message: 'Focused target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        warnings,
      };
    }

    if (type === 'hover') {
      hoverElement(element);
      return {
        success: true,
        action: type,
        message: 'Hovered target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        warnings,
      };
    }

    if (type === 'click') {
      clickElement(element);
      return {
        success: true,
        action: type,
        message: 'Clicked target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        warnings,
      };
    }

    if (type === 'pressEnter') {
      pressEnter(element);
      return {
        success: true,
        action: type,
        message: 'Pressed Enter on target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        warnings,
      };
    }

    if (type === 'clear') {
      if (element.isContentEditable) {
        focusElement(element);
        element.textContent = '';
        dispatchInputLikeEvents(element);
        return {
          success: true,
          action: type,
          message: 'Cleared contenteditable element',
          url: location.href,
          title: document.title || '',
          element: summary,
          value: '',
          warnings,
        };
      }

      if ('value' in element) {
        focusElement(element);
        setNativeInputValue(element, '');
        dispatchInputLikeEvents(element);
        return {
          success: true,
          action: type,
          message: 'Cleared input-like element',
          url: location.href,
          title: document.title || '',
          element: summary,
          value: getValueText(element),
          warnings,
        };
      }

      throw new Error('Clear action requires an input, textarea, select, or contenteditable element');
    }

    if (type === 'type') {
      if (typeof value !== 'string') {
        throw new Error('Type action requires string value');
      }

      focusElement(element);
      if (element.isContentEditable) {
        if (opts.clearBeforeType) {
          element.textContent = '';
        }
        element.textContent = value;
        dispatchInputLikeEvents(element);
      } else if ('value' in element) {
        if (!opts.clearBeforeType && typeof element.value === 'string' && element.value.length > 0) {
          setNativeInputValue(element, element.value + value);
        } else {
          setNativeInputValue(element, value);
        }
        dispatchInputLikeEvents(element);
      } else {
        throw new Error('Type action requires an input, textarea, or contenteditable element');
      }

      if (opts.pressEnter) {
        pressEnter(element);
      }

      return {
        success: true,
        action: type,
        message: opts.pressEnter
          ? 'Typed value and pressed Enter'
          : 'Typed value into target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        value: getValueText(element),
        warnings,
      };
    }

    if (type === 'select') {
      if (!(element instanceof HTMLSelectElement)) {
        throw new Error('Select action requires a <select> element target');
      }
      if (typeof value !== 'string') {
        throw new Error('Select action requires string value');
      }

      const matcher = normalizeText(value, 200).toLowerCase();
      let selectedOption =
        Array.from(element.options).find((option) => option.value === value) ||
        Array.from(element.options).find(
          (option) => normalizeText(option.textContent || '', 200).toLowerCase() === matcher
        ) ||
        Array.from(element.options).find((option) =>
          normalizeText(option.textContent || '', 200).toLowerCase().includes(matcher)
        );

      if (!selectedOption) {
        throw new Error('No matching select option found for value: ' + value);
      }

      element.value = selectedOption.value;
      dispatchInputLikeEvents(element);

      return {
        success: true,
        action: type,
        message: 'Selected option "' + normalizeText(selectedOption.textContent || selectedOption.value, 120) + '"',
        url: location.href,
        title: document.title || '',
        element: summary,
        value: element.value,
        warnings,
      };
    }

    throw new Error('Unsupported action type: ' + type);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: payload.type,
      message,
      url: location.href,
      title: document.title || '',
      warnings: [],
    };
  }
})()
`.trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseExecutionResult(raw: unknown): ActExecutionScriptResult {
  if (!isObject(raw)) {
    throw new Error('Action returned an invalid payload');
  }

  const { success, action, message, url, title, element, value, warnings } =
    raw as Partial<ActExecutionScriptResult>;

  if (
    typeof success !== 'boolean' ||
    typeof action !== 'string' ||
    typeof message !== 'string' ||
    typeof url !== 'string' ||
    typeof title !== 'string' ||
    !Array.isArray(warnings)
  ) {
    throw new Error('Action payload is missing required fields');
  }

  const parsed: ActExecutionScriptResult = {
    success,
    action: action as ActAction,
    message,
    url,
    title,
    warnings: warnings.filter((w): w is string => typeof w === 'string'),
  };

  if (typeof value === 'string') {
    parsed.value = value;
  }

  if (isObject(element)) {
    const tag = typeof element.tag === 'string' ? element.tag : '';
    const role = typeof element.role === 'string' ? element.role : '';
    const name = typeof element.name === 'string' ? element.name : '';
    const selectorUsed = typeof element.selectorUsed === 'string' ? element.selectorUsed : '';
    const bboxObject = isObject(element.bbox) ? element.bbox : undefined;
    const bbox = {
      x: typeof bboxObject?.x === 'number' ? bboxObject.x : 0,
      y: typeof bboxObject?.y === 'number' ? bboxObject.y : 0,
      width: typeof bboxObject?.width === 'number' ? bboxObject.width : 0,
      height: typeof bboxObject?.height === 'number' ? bboxObject.height : 0,
    };
    parsed.element = { tag, role, name, selectorUsed, bbox };
  }

  return parsed;
}

function formatActionContent(details: ActToolDetails): string {
  const lines: string[] = [];
  lines.push(`Action: ${details.action}`);
  lines.push(`Result: ${details.message}`);
  lines.push(`Tab: ${details.tab.tabId}`);
  lines.push(`URL: ${details.page.url}`);

  if (details.element) {
    const rolePart = details.element.role ? ` role=${details.element.role}` : '';
    lines.push(
      `Element: <${details.element.tag}${rolePart}> "${details.element.name || '(unnamed)'}" via ${details.element.selectorUsed || '(matcher)'}`
    );
    lines.push(
      `Element Box: (${details.element.bbox.x}, ${details.element.bbox.y}, ${details.element.bbox.width}x${details.element.bbox.height})`
    );
  }

  if (details.value !== undefined) {
    lines.push(`Value: ${details.value}`);
  }

  if (details.warnings?.length) {
    lines.push(`Warnings: ${details.warnings.join(' | ')}`);
  }

  return lines.join('\n');
}

async function waitForTabSettled(
  client: ActChromeClient,
  tabId: number,
  timeoutMs: number
): Promise<void> {
  if (timeoutMs <= 0) {
    return;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await callChrome<ChromeTab>(client, 'tabs.get', tabId);
    if (tab.status === 'complete') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export function createActTool(options: ActToolOptions): AgentTool<typeof actSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw new Error('createActTool requires a positive integer windowId');
  }

  const windowId = options.windowId;
  const getClient = options.operations?.getClient ?? createDefaultGetClient(options.connectOptions);
  const inspectTool = createInspectTool({
    windowId,
    operations: {
      getClient,
    },
  });

  return {
    name: 'act',
    label: 'act',
    description:
      'Perform browser actions on page elements. Supports click, type, clear, pressEnter, select, scroll, hover, and focus. Target can be CSS/locator fields or inspect_page ids like E1.',
    parameters: actSchema,
    execute: async (_toolCallId: string, input: ActToolInput) => {
      validateInput(input);

      const client = await getClient();
      const normalizedOptions = normalizeOptions(input);

      const targetTab = await getTargetTab(client, windowId, input.tabId);
      const targetTabId = targetTab.id;
      if (typeof targetTabId !== 'number') {
        throw new Error('Target tab id is missing');
      }

      await callChrome<ChromeTab>(client, 'tabs.update', targetTabId, { active: true });
      await callChrome<unknown>(client, 'windows.update', windowId, { focused: true });

      const resolvedTarget = await resolveTargetFromInspectElementId(
        inspectTool,
        _toolCallId,
        targetTabId,
        input.target
      );

      const payloadBase: ActPayload = {
        type: input.type,
        opts: normalizedOptions,
      };
      const payload: ActPayload = {
        ...payloadBase,
        ...(resolvedTarget !== undefined ? { target: resolvedTarget } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
      };

      const script = buildActScript(payload);
      const evaluation = await callChrome<DebuggerEvaluateResult>(client, 'debugger.evaluate', {
        tabId: targetTabId,
        code: script,
      });
      const executionResult = parseExecutionResult(evaluation.result);

      if (!executionResult.success) {
        throw new Error(executionResult.message);
      }

      await waitForTabSettled(client, targetTabId, normalizedOptions.waitForNavigationMs);

      if (normalizedOptions.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, normalizedOptions.delayMs));
      }

      const refreshedTab = await callChrome<ChromeTab>(client, 'tabs.get', targetTabId);
      const tab = toActTab(refreshedTab);

      const detailsBase: ActToolDetails = {
        action: input.type,
        windowId,
        tab,
        page: {
          url: executionResult.url || tab.url,
          title: executionResult.title || tab.title,
        },
        message: executionResult.message,
        ...(input.target !== undefined ? { target: input.target } : {}),
        ...(executionResult.value !== undefined ? { value: executionResult.value } : {}),
        ...(executionResult.element !== undefined ? { element: executionResult.element } : {}),
      };

      const details: ActToolDetails =
        executionResult.warnings.length > 0
          ? { ...detailsBase, warnings: executionResult.warnings }
          : detailsBase;

      return {
        content: [{ type: 'text', content: formatActionContent(details) }],
        details,
      };
    },
  };
}
