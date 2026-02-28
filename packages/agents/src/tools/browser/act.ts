import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import {
  browserToolError,
  formatBrowserToolErrorMessage,
  type BrowserToolErrorCode,
} from './errors.js';
import { createInspectTool, type InspectInteractiveElement } from './inspect.js';

import type { AgentTool, Message, ToolExecutionContext } from '@ank1015/llm-sdk';

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
            'After action, wait up to this many ms for tab/page state to settle (default: 5000 for click, pressEnter, select, and type+pressEnter; else 0).',
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
  outcome?: ActActionOutcome;
  warnings: string[];
}

export interface ActActionOutcome {
  observed: boolean;
  signals: string[];
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
  outcome?: ActActionOutcome;
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

interface ActionWaitSample {
  status: string;
  url: string;
  title: string;
  readyState: string;
  textLength: number;
  nodeCount: number;
}

interface ActionWaitResult {
  changedObserved: boolean;
  finalSample: ActionWaitSample;
}

const DEFAULT_WAIT_FOR_NAV_MS = 5000;
const ACTION_WAIT_POLL_INTERVAL_MS = 150;
const ACTION_WAIT_STABLE_POLLS = 2;
const ACTION_WAIT_QUIET_MS = 350;
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
    throw browserToolError(
      'TAB_ID_MISSING',
      'Chrome tab response did not include a numeric tab id'
    );
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
      throw browserToolError(
        'TAB_SCOPE_VIOLATION',
        `Tab ${tabId} does not belong to window ${windowId}`
      );
    }
    return tab;
  }

  const activeTab = await findActiveTab(client, windowId);
  if (!activeTab) {
    throw browserToolError('TAB_NOT_FOUND', `No tab found in window ${windowId}`);
  }

  return activeTab;
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), min), max);
}

function getDefaultWaitMs(input: ActToolInput): number {
  if (
    input.type === 'click' ||
    input.type === 'pressEnter' ||
    input.type === 'select' ||
    (input.type === 'type' && input.opts?.pressEnter === true)
  ) {
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
    waitForNavigationMs: clamp(opts?.waitForNavigationMs, 0, 30000, getDefaultWaitMs(input)),
    delayMs: clamp(opts?.delayMs, 0, 30000, 0),
  };
}

function requireValue(input: ActToolInput, name: string): void {
  if (input.value === undefined) {
    throw browserToolError('INVALID_INPUT', `Action "${input.type}" requires ${name}`);
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
    throw browserToolError('INVALID_INPUT', `Action "${input.type}" requires target`);
  }

  if (input.type === 'type') {
    requireValue(input, 'a string value');
    if (typeof input.value !== 'string') {
      throw browserToolError('INVALID_INPUT', 'Action "type" requires value to be a string');
    }
  }

  if (input.type === 'select') {
    requireValue(input, 'a string value');
    if (typeof input.value !== 'string') {
      throw browserToolError('INVALID_INPUT', 'Action "select" requires value to be a string');
    }
  }

  if (input.type === 'scroll' && input.value !== undefined) {
    const isNumber = typeof input.value === 'number';
    const isObject = typeof input.value === 'object' && input.value !== null;
    if (!isNumber && !isObject) {
      throw browserToolError('INVALID_INPUT', 'Action "scroll" value must be a number or object');
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
    throw browserToolError('PAYLOAD_INVALID', 'inspect_page did not return interactive elements');
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
  target: ActTarget | undefined,
  context?: ToolExecutionContext
): Promise<ActTarget | undefined> {
  const inspectElementId = getInspectElementIdFromTarget(target);
  if (!inspectElementId) {
    return target;
  }

  const cached = findInspectElementInContext(context?.messages, tabId, inspectElementId);
  if (cached) {
    return toTargetFromInspectElement(cached);
  }

  const inspectResult = await inspectTool.execute(`${toolCallId}:inspect`, { tabId });
  const interactive = parseInspectInteractiveElements(inspectResult.details);
  const mapped = interactive.find((element) => element.id.toUpperCase() === inspectElementId);

  if (!mapped) {
    throw browserToolError(
      'TARGET_NOT_FOUND',
      `Element id "${inspectElementId}" was not found in inspect_page snapshot for tab ${tabId}`
    );
  }

  return toTargetFromInspectElement(mapped);
}

function findInspectElementInContext(
  messages: readonly Message[] | undefined,
  tabId: number,
  inspectElementId: string
): InspectInteractiveElement | undefined {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'toolResult' || message.isError) {
      continue;
    }
    if (message.toolName !== 'inspect_page' || !isObject(message.details)) {
      continue;
    }

    const details = message.details as Record<string, unknown>;
    if (
      !isObject(details.tab) ||
      typeof details.tab.tabId !== 'number' ||
      details.tab.tabId !== tabId
    ) {
      continue;
    }

    const interactive = parseInspectInteractiveElements(details);
    const mapped = interactive.find((element) => element.id.toUpperCase() === inspectElementId);
    if (mapped) {
      return mapped;
    }
  }

  return undefined;
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

  const normalizeNewlines = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/\\r\\n?/g, '\\n');
  };

  const normalizeForComparison = (value) => {
    return normalizeNewlines(value).replace(/\\u00a0/g, ' ');
  };

  const toCodedMessage = (code, message) => '[' + code + '] ' + message;

  const fail = (code, message) => {
    throw new Error(toCodedMessage(code, message));
  };

  const classifyErrorCode = (message) => {
    if (/^\\[[A-Z0-9_]+\\]/.test(message)) return '';
    if (message.startsWith('Target element is not interactable')) return 'TARGET_NOT_INTERACTABLE';
    if (message.includes('Target element not found')) return 'TARGET_NOT_FOUND';
    if (message.includes('No matching select option found')) return 'TARGET_NOT_FOUND';
    if (message.includes('requires target')) return 'INVALID_INPUT';
    if (message.includes('requires string value')) return 'INVALID_INPUT';
    if (message.includes('requires an input') || message.includes('requires a <select>')) return 'INVALID_INPUT';
    if (message.includes('did not update target value')) return 'NO_OBSERVABLE_EFFECT';
    if (message.includes('did not change target value')) return 'NO_OBSERVABLE_EFFECT';
    if (message.includes('did not move focus')) return 'NO_OBSERVABLE_EFFECT';
    if (message.includes('Unsupported action type')) return 'UNSUPPORTED_ACTION';
    return 'INTERNAL';
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

  const getCandidateScore = (element) => {
    if (!element || !element.isConnected) return -10000;

    let score = 0;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) score += 220;
    else score -= 220;

    const style = window.getComputedStyle(element);
    const hidden =
      element.hidden ||
      element.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity || '1') === 0;
    if (!hidden) score += 90;
    else score -= 120;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const offscreen =
      rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth;
    if (!offscreen) score += 35;
    else score -= 20;

    if (typeof element.disabled === 'boolean' && element.disabled) {
      score -= 40;
    }
    if (style.pointerEvents === 'none') {
      score -= 25;
    }

    return score;
  };

  const selectByIndex = (elements, indexValue) => {
    if (!elements.length) return undefined;

    if (Number.isInteger(indexValue)) {
      const index = Math.max(0, indexValue);
      return elements[index] || elements[0];
    }

    let best = elements[0];
    let bestScore = getCandidateScore(best);
    for (let i = 1; i < elements.length; i++) {
      const score = getCandidateScore(elements[i]);
      if (score > bestScore) {
        best = elements[i];
        bestScore = score;
      }
    }
    return best;
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
          'a, button, input, select, textarea, [role], [contenteditable], [tabindex]'
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
      return normalizeNewlines(element.value);
    }
    if (isContentEditableElement(element)) {
      return normalizeNewlines(element.textContent || '');
    }
    if (element instanceof HTMLSelectElement) {
      const option = element.options[element.selectedIndex];
      return option ? option.value : '';
    }
    return '';
  };

  const createOutcome = (observed, signals) => ({
    observed: !!observed,
    signals: Array.from(new Set((Array.isArray(signals) ? signals : []).filter(Boolean))),
  });

  const getOutcomeSnapshot = (element) => {
    const active = document.activeElement;
    const activeOnTarget = !!active && (active === element || element.contains(active));
    const checked =
      typeof element.checked === 'boolean'
        ? element.checked
        : undefined;
    const ariaExpanded =
      typeof element.getAttribute === 'function' ? element.getAttribute('aria-expanded') || '' : '';
    const ariaPressed =
      typeof element.getAttribute === 'function' ? element.getAttribute('aria-pressed') || '' : '';
    const ariaSelected =
      typeof element.getAttribute === 'function' ? element.getAttribute('aria-selected') || '' : '';
    return {
      activeOnTarget,
      value: normalizeForComparison(getValueText(element)),
      checked,
      ariaExpanded,
      ariaPressed,
      ariaSelected,
      text: normalizeForComparison(normalizeText(element.textContent || '', 240)),
      className:
        typeof element.className === 'string'
          ? normalizeForComparison(element.className)
          : '',
    };
  };

  const evaluateOutcome = (before, after) => {
    const signals = [];
    if (!before.activeOnTarget && after.activeOnTarget) signals.push('focus moved to target');
    if (before.value !== after.value) signals.push('target value changed');
    if (before.checked !== after.checked) signals.push('checked state changed');
    if (before.ariaExpanded !== after.ariaExpanded) signals.push('aria-expanded changed');
    if (before.ariaPressed !== after.ariaPressed) signals.push('aria-pressed changed');
    if (before.ariaSelected !== after.ariaSelected) signals.push('aria-selected changed');
    if (before.text !== after.text) signals.push('target text changed');
    if (before.className !== after.className) signals.push('target class changed');
    return createOutcome(signals.length > 0, signals);
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

  const isContentEditableElement = (element) => {
    if (!element) return false;
    if (element.isContentEditable) return true;
    const value =
      typeof element.getAttribute === 'function' ? element.getAttribute('contenteditable') : null;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '' || normalized === 'true' || normalized === 'plaintext-only';
  };

  const hasValueProperty = (element) => {
    return !!(
      element &&
      typeof element === 'object' &&
      'value' in element &&
      typeof element.value === 'string'
    );
  };

  const resolveTypeableElement = (element) => {
    if (!element) return undefined;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element;
    }

    if (isContentEditableElement(element)) {
      return element;
    }

    if (hasValueProperty(element)) {
      return element;
    }

    const candidates = Array.from(
      element.querySelectorAll(
        'input:not([type="hidden"]), textarea, [contenteditable], [role="textbox"], [role="searchbox"], [role="combobox"]'
      )
    );

    for (const candidate of candidates) {
      if (
        candidate instanceof HTMLInputElement ||
        candidate instanceof HTMLTextAreaElement ||
        isContentEditableElement(candidate) ||
        hasValueProperty(candidate)
      ) {
        return candidate;
      }
    }

    return undefined;
  };

  const resolveSelectElement = (element) => {
    if (element instanceof HTMLSelectElement) {
      return element;
    }
    const nested = element.querySelector('select');
    return nested instanceof HTMLSelectElement ? nested : undefined;
  };

  const getInteractabilityIssue = (element, actionType) => {
    if (!element || !element.isConnected) {
      return 'target is detached from the DOM';
    }

    const style = window.getComputedStyle(element);
    if (
      element.hidden ||
      element.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity || '1') === 0
    ) {
      return 'target is hidden';
    }

    if ((actionType === 'click' || actionType === 'hover') && style.pointerEvents === 'none') {
      return 'target ignores pointer events';
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return 'target has zero area';
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth) {
      return 'target is outside the viewport';
    }

    if (typeof element.disabled === 'boolean' && element.disabled) {
      return 'target is disabled';
    }

    if (
      (actionType === 'type' || actionType === 'clear') &&
      typeof element.readOnly === 'boolean' &&
      element.readOnly
    ) {
      return 'target is readonly';
    }

    const requiresHitTest =
      actionType === 'click' ||
      actionType === 'hover' ||
      actionType === 'focus' ||
      actionType === 'type' ||
      actionType === 'clear' ||
      actionType === 'select' ||
      actionType === 'pressEnter';

    if (!requiresHitTest) {
      return '';
    }

    const maxX = Math.max(0, viewportWidth - 1);
    const maxY = Math.max(0, viewportHeight - 1);
    const centerX = Math.min(Math.max(rect.left + rect.width / 2, 0), maxX);
    const centerY = Math.min(Math.max(rect.top + rect.height / 2, 0), maxY);
    const topElement = document.elementFromPoint(centerX, centerY);
    if (
      topElement &&
      topElement !== element &&
      !element.contains(topElement) &&
      !topElement.contains(element)
    ) {
      return 'target is covered by another element';
    }

    return '';
  };

  const ensureInteractable = (element, actionType) => {
    const issue = getInteractabilityIssue(element, actionType);
    if (issue) {
      fail('TARGET_NOT_INTERACTABLE', 'Target element is not interactable: ' + issue);
    }
  };

  const canAutoActivateContainer = (actionType) => {
    return (
      actionType === 'type' ||
      actionType === 'clear' ||
      actionType === 'select' ||
      actionType === 'pressEnter' ||
      actionType === 'focus'
    );
  };

  const collectActivationCandidates = (element) => {
    const candidates = [];
    const seen = new Set();

    const add = (candidate) => {
      if (!candidate || candidate === element || seen.has(candidate)) return;
      seen.add(candidate);
      candidates.push(candidate);
    };

    if (element.id) {
      try {
        add(document.querySelector('label[for="' + cssEscape(element.id) + '"]'));
      } catch {
        // Ignore selector errors.
      }
    }

    if (typeof element.closest === 'function') {
      add(element.closest('label'));
      add(
        element.closest(
          '[role="combobox"], [role="textbox"], [role="group"], [role="dialog"], [contenteditable], form, section'
        )
      );
    }

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 8) {
      add(current);
      current = current.parentElement;
      depth += 1;
    }

    return candidates;
  };

  const tryActivateTargetContainer = (element, scrollBehavior, warnings) => {
    const candidates = collectActivationCandidates(element);

    for (const candidate of candidates) {
      scrollElementIntoView(candidate, scrollBehavior);
      const issue = getInteractabilityIssue(candidate, 'click');
      if (issue) {
        continue;
      }

      clickElement(candidate);
      focusElement(candidate);
      warnings.push('Activated a nearby container before interacting with the target.');
      return true;
    }

    return false;
  };

  const resolveElementForAction = (target, actionType, scrollBehavior, warnings) => {
    const resolved = resolveElement(target);
    if (!resolved.element) {
      return resolved;
    }

    if (!canAutoActivateContainer(actionType)) {
      return resolved;
    }

    const issue = getInteractabilityIssue(resolved.element, actionType);
    if (issue !== 'target has zero area') {
      return resolved;
    }

    const activated = tryActivateTargetContainer(resolved.element, scrollBehavior, warnings);
    if (!activated) {
      return resolved;
    }

    const retried = resolveElement(target);
    if (retried.element) {
      warnings.push('Retried target lookup after activating container.');
      return retried;
    }

    return resolved;
  };

  try {
    const { type, target, value, opts } = payload;
    const warnings = [];

    if (type === 'scroll') {
      if (target) {
        const resolved = resolveElement(target);
        if (!resolved.element) {
          fail('TARGET_NOT_FOUND', 'Target element not found for scroll');
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

    const resolved = resolveElementForAction(target, type, opts.scrollBehavior, warnings);
    const element = resolved.element;
    if (!element) {
      fail('TARGET_NOT_FOUND', 'Target element not found');
    }

    scrollElementIntoView(element, opts.scrollBehavior);

    if (type === 'focus') {
      ensureInteractable(element, 'focus');
      focusElement(element);
      const summary = getElementSummary(element, resolved.selectorUsed);
      const activeElement = document.activeElement;
      if (activeElement !== element && !element.contains(activeElement)) {
        fail('NO_OBSERVABLE_EFFECT', 'Focus action did not move focus to target element');
      }
      return {
        success: true,
        action: type,
        message: 'Focused target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        outcome: createOutcome(true, ['focus moved to target']),
        warnings,
      };
    }

    if (type === 'hover') {
      ensureInteractable(element, 'hover');
      hoverElement(element);
      const summary = getElementSummary(element, resolved.selectorUsed);
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
      ensureInteractable(element, 'click');
      const beforeOutcome = getOutcomeSnapshot(element);
      clickElement(element);
      const afterOutcome = getOutcomeSnapshot(element);
      const outcome = evaluateOutcome(beforeOutcome, afterOutcome);
      const summary = getElementSummary(element, resolved.selectorUsed);
      return {
        success: true,
        action: type,
        message: 'Clicked target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        outcome,
        warnings,
      };
    }

    if (type === 'pressEnter') {
      ensureInteractable(element, 'pressEnter');
      const beforeOutcome = getOutcomeSnapshot(element);
      pressEnter(element);
      const afterOutcome = getOutcomeSnapshot(element);
      const outcome = evaluateOutcome(beforeOutcome, afterOutcome);
      const summary = getElementSummary(element, resolved.selectorUsed);
      return {
        success: true,
        action: type,
        message: 'Pressed Enter on target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        outcome,
        warnings,
      };
    }

    if (type === 'clear') {
      const clearElement = resolveTypeableElement(element);
      if (!clearElement) {
        fail(
          'INVALID_INPUT',
          'Clear action requires an input, textarea, select, contenteditable, or nested editable control'
        );
      }

      if (clearElement !== element) {
        warnings.push('Resolved target to a nested editable control.');
      }

      scrollElementIntoView(clearElement, opts.scrollBehavior);
      ensureInteractable(clearElement, 'clear');
      focusElement(clearElement);

      if (isContentEditableElement(clearElement)) {
        clearElement.textContent = '';
        dispatchInputLikeEvents(clearElement);
      } else if (hasValueProperty(clearElement)) {
        setNativeInputValue(clearElement, '');
        dispatchInputLikeEvents(clearElement);
      } else {
        fail(
          'INVALID_INPUT',
          'Clear action requires an input, textarea, select, contenteditable, or nested editable control'
        );
      }

      const clearedValue = getValueText(clearElement);
      if (clearedValue !== '') {
        fail('NO_OBSERVABLE_EFFECT', 'Clear action did not update target value');
      }

      const summary = getElementSummary(clearElement, resolved.selectorUsed);
      return {
        success: true,
        action: type,
        message: 'Cleared input-like element',
        url: location.href,
        title: document.title || '',
        element: summary,
        value: clearedValue,
        outcome: createOutcome(true, ['target value changed']),
        warnings,
      };
    }

    if (type === 'type') {
      if (typeof value !== 'string') {
        fail('INVALID_INPUT', 'Type action requires string value');
      }

      const typeElement = resolveTypeableElement(element);
      if (!typeElement) {
        fail(
          'INVALID_INPUT',
          'Type action requires an input, textarea, contenteditable, or nested editable control'
        );
      }

      if (typeElement !== element) {
        warnings.push('Resolved target to a nested editable control.');
      }

      scrollElementIntoView(typeElement, opts.scrollBehavior);
      ensureInteractable(typeElement, 'type');

      const beforeValue = getValueText(typeElement);
      focusElement(typeElement);

      if (isContentEditableElement(typeElement)) {
        if (opts.clearBeforeType) {
          typeElement.textContent = '';
        } else {
          typeElement.textContent = normalizeNewlines(typeElement.textContent || '') + value;
        }
        if (opts.clearBeforeType) typeElement.textContent = value;
        dispatchInputLikeEvents(typeElement);
      } else if (hasValueProperty(typeElement)) {
        if (!opts.clearBeforeType && typeof typeElement.value === 'string' && typeElement.value.length > 0) {
          setNativeInputValue(typeElement, typeElement.value + value);
        } else {
          setNativeInputValue(typeElement, value);
        }
        dispatchInputLikeEvents(typeElement);
      } else {
        fail(
          'INVALID_INPUT',
          'Type action requires an input, textarea, contenteditable, or nested editable control'
        );
      }

      if (opts.pressEnter) {
        pressEnter(typeElement);
      }

      const typedValue = getValueText(typeElement);
      if (value.length > 0) {
        if (opts.clearBeforeType) {
          const expectedNormalized = normalizeForComparison(value);
          const actualNormalized = normalizeForComparison(typedValue);
          const expectedTrimmed = expectedNormalized.replace(/\\n+$/g, '');
          const actualTrimmed = actualNormalized.replace(/\\n+$/g, '');
          if (
            actualNormalized !== expectedNormalized &&
            actualTrimmed !== expectedTrimmed
          ) {
            fail('NO_OBSERVABLE_EFFECT', 'Type action did not update target value');
          }
        } else if (normalizeForComparison(typedValue) === normalizeForComparison(beforeValue)) {
          fail('NO_OBSERVABLE_EFFECT', 'Type action did not change target value');
        }
      }

      const summary = getElementSummary(typeElement, resolved.selectorUsed);
      return {
        success: true,
        action: type,
        message: opts.pressEnter
          ? 'Typed value and pressed Enter'
          : 'Typed value into target element',
        url: location.href,
        title: document.title || '',
        element: summary,
        value: typedValue,
        outcome: createOutcome(true, ['target value changed']),
        warnings,
      };
    }

    if (type === 'select') {
      const selectElement = resolveSelectElement(element);
      if (!selectElement) {
        fail('INVALID_INPUT', 'Select action requires a <select> element target or nested <select>');
      }
      if (selectElement !== element) {
        warnings.push('Resolved target to a nested <select> control.');
      }
      if (typeof value !== 'string') {
        fail('INVALID_INPUT', 'Select action requires string value');
      }

      scrollElementIntoView(selectElement, opts.scrollBehavior);
      ensureInteractable(selectElement, 'select');

      const matcher = normalizeText(value, 200).toLowerCase();
      let selectedOption =
        Array.from(selectElement.options).find((option) => option.value === value) ||
        Array.from(selectElement.options).find(
          (option) => normalizeText(option.textContent || '', 200).toLowerCase() === matcher
        ) ||
        Array.from(selectElement.options).find((option) =>
          normalizeText(option.textContent || '', 200).toLowerCase().includes(matcher)
        );

      if (!selectedOption) {
        fail('TARGET_NOT_FOUND', 'No matching select option found for value: ' + value);
      }

      selectElement.value = selectedOption.value;
      dispatchInputLikeEvents(selectElement);

      if (selectElement.value !== selectedOption.value) {
        fail('NO_OBSERVABLE_EFFECT', 'Select action did not update selected value');
      }

      const summary = getElementSummary(selectElement, resolved.selectorUsed);
      return {
        success: true,
        action: type,
        message: 'Selected option "' + normalizeText(selectedOption.textContent || selectedOption.value, 120) + '"',
        url: location.href,
        title: document.title || '',
        element: summary,
        value: selectElement.value,
        outcome: createOutcome(true, ['target value changed']),
        warnings,
      };
    }

    fail('UNSUPPORTED_ACTION', 'Unsupported action type: ' + type);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = classifyErrorCode(message);
    const normalizedMessage = code ? toCodedMessage(code, message) : message;
    return {
      success: false,
      action: payload.type,
      message: normalizedMessage,
      url: location.href,
      title: document.title || '',
      warnings: [],
    };
  }
})()
`.trim();
}

function parseExecutionResult(raw: unknown): ActExecutionScriptResult {
  if (!isObject(raw)) {
    throw browserToolError('PAYLOAD_INVALID', 'Action returned an invalid payload');
  }

  const { success, action, message, url, title, element, value, outcome, warnings } =
    raw as Partial<ActExecutionScriptResult>;

  if (
    typeof success !== 'boolean' ||
    typeof action !== 'string' ||
    typeof message !== 'string' ||
    typeof url !== 'string' ||
    typeof title !== 'string' ||
    !Array.isArray(warnings)
  ) {
    throw browserToolError('PAYLOAD_INVALID', 'Action payload is missing required fields');
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

  if (isObject(outcome)) {
    const observed = typeof outcome.observed === 'boolean' ? outcome.observed : false;
    const signals = Array.isArray(outcome.signals)
      ? outcome.signals.filter((signal): signal is string => typeof signal === 'string')
      : [];
    parsed.outcome = { observed, signals };
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

  if (details.outcome) {
    const signals =
      details.outcome.signals.length > 0 ? details.outcome.signals.join(' | ') : 'none';
    lines.push(`Outcome Observed: ${details.outcome.observed ? 'yes' : 'no'} (${signals})`);
  }

  if (details.warnings?.length) {
    lines.push(`Warnings: ${details.warnings.join(' | ')}`);
  }

  return lines.join('\n');
}

function requiresObservableOutcome(input: ActToolInput): boolean {
  return input.type === 'click' || input.type === 'pressEnter';
}

function combineOutcomeSignals(
  scriptOutcome: ActActionOutcome | undefined,
  waitResult: ActionWaitResult
): ActActionOutcome | undefined {
  const signals: string[] = [];
  if (waitResult.changedObserved) {
    signals.push('page state changed');
  }
  if (scriptOutcome?.signals.length) {
    signals.push(...scriptOutcome.signals);
  }

  if (signals.length === 0 && !scriptOutcome) {
    return undefined;
  }

  return {
    observed: waitResult.changedObserved || scriptOutcome?.observed === true,
    signals: Array.from(new Set(signals)),
  };
}

function hasErrorCodePrefix(message: string): boolean {
  return /^\[[A-Z0-9_]+\]/u.test(message.trim());
}

function classifyActionFailureCode(message: string): BrowserToolErrorCode {
  if (message.startsWith('Target element is not interactable')) return 'TARGET_NOT_INTERACTABLE';
  if (message.includes('Target element not found')) return 'TARGET_NOT_FOUND';
  if (message.includes('No matching select option found')) return 'TARGET_NOT_FOUND';
  if (message.includes('requires target')) return 'INVALID_INPUT';
  if (message.includes('requires string value')) return 'INVALID_INPUT';
  if (message.includes('requires an input') || message.includes('requires a <select>'))
    return 'INVALID_INPUT';
  if (message.includes('did not update target value')) return 'NO_OBSERVABLE_EFFECT';
  if (message.includes('did not change target value')) return 'NO_OBSERVABLE_EFFECT';
  if (message.includes('did not move focus')) return 'NO_OBSERVABLE_EFFECT';
  if (message.includes('Unsupported action type')) return 'UNSUPPORTED_ACTION';
  return 'INTERNAL';
}

function toCodedActionFailureMessage(message: string): string {
  if (hasErrorCodePrefix(message)) {
    return message;
  }
  const code = classifyActionFailureCode(message);
  return formatBrowserToolErrorMessage(code, message);
}

async function waitForTabSettled(
  client: ActChromeClient,
  tabId: number,
  timeoutMs: number,
  baseline: ActionWaitSample
): Promise<ActionWaitResult> {
  if (timeoutMs <= 0) {
    return {
      changedObserved: false,
      finalSample: baseline,
    };
  }

  const start = Date.now();
  let previousSignature = '';
  let stableCount = 0;
  let changedObserved = false;
  let latestSample = baseline;

  while (Date.now() - start < timeoutMs) {
    const sample = await getActionWaitSample(client, tabId);
    latestSample = sample;

    if (
      sample.status !== baseline.status ||
      sample.url !== baseline.url ||
      sample.title !== baseline.title ||
      sample.readyState !== baseline.readyState ||
      sample.textLength !== baseline.textLength ||
      sample.nodeCount !== baseline.nodeCount
    ) {
      changedObserved = true;
    }

    const signature = `${sample.status}|${sample.url}|${sample.title}|${sample.readyState}|${sample.textLength}|${sample.nodeCount}`;
    if (signature === previousSignature) {
      stableCount += 1;
    } else {
      stableCount = 0;
      previousSignature = signature;
    }

    if (
      sample.status === 'complete' &&
      stableCount >= ACTION_WAIT_STABLE_POLLS &&
      changedObserved
    ) {
      return {
        changedObserved: true,
        finalSample: sample,
      };
    }

    if (!changedObserved && Date.now() - start >= ACTION_WAIT_QUIET_MS && stableCount >= 1) {
      return {
        changedObserved: false,
        finalSample: sample,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, ACTION_WAIT_POLL_INTERVAL_MS));
  }

  throw browserToolError(
    'ACTION_TIMEOUT',
    `Action did not settle within ${timeoutMs}ms for tab ${tabId} (status=${latestSample.status}, url=${latestSample.url || '(empty)'})`,
    {
      retryable: true,
    }
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSafeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toSafeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function getActionWaitSample(
  client: ActChromeClient,
  tabId: number
): Promise<ActionWaitSample> {
  const tab = await callChrome<ChromeTab>(client, 'tabs.get', tabId);
  const status = typeof tab.status === 'string' && tab.status ? tab.status : 'complete';
  const url = tab.url ?? '';
  const title = tab.title ?? '';

  let readyState = 'unknown';
  let textLength = 0;
  let nodeCount = 0;

  try {
    const evaluation = await callChrome<DebuggerEvaluateResult>(client, 'debugger.evaluate', {
      tabId,
      code: `
(() => {
  const body = document.body;
  return {
    readyState: document.readyState || 'unknown',
    textLength: typeof body?.innerText === 'string' ? body.innerText.length : 0,
    nodeCount: document.getElementsByTagName('*').length,
  };
})()
      `.trim(),
    });
    if (isObject(evaluation.result)) {
      readyState = toSafeString(evaluation.result.readyState) || readyState;
      textLength = toSafeNumber(evaluation.result.textLength);
      nodeCount = toSafeNumber(evaluation.result.nodeCount);
    }
  } catch {
    // Keep tab-level fallback metrics when page evaluation is unavailable.
  }

  return {
    status,
    url,
    title,
    readyState,
    textLength,
    nodeCount,
  };
}

export function createActTool(options: ActToolOptions): AgentTool<typeof actSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw browserToolError('INVALID_INPUT', 'createActTool requires a positive integer windowId');
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
    execute: async (
      _toolCallId: string,
      input: ActToolInput,
      _signal?: AbortSignal,
      _onUpdate?: unknown,
      context?: ToolExecutionContext
    ) => {
      validateInput(input);

      const client = await getClient();
      const normalizedOptions = normalizeOptions(input);

      const targetTab = await getTargetTab(client, windowId, input.tabId);
      const targetTabId = targetTab.id;
      if (typeof targetTabId !== 'number') {
        throw browserToolError('TAB_ID_MISSING', 'Target tab id is missing');
      }

      await callChrome<ChromeTab>(client, 'tabs.update', targetTabId, { active: true });
      await callChrome<unknown>(client, 'windows.update', windowId, { focused: true });

      const resolvedTarget = await resolveTargetFromInspectElementId(
        inspectTool,
        _toolCallId,
        targetTabId,
        input.target,
        context
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

      const baseline = await getActionWaitSample(client, targetTabId);
      const script = buildActScript(payload);
      const evaluation = await callChrome<DebuggerEvaluateResult>(client, 'debugger.evaluate', {
        tabId: targetTabId,
        code: script,
      });
      const executionResult = parseExecutionResult(evaluation.result);

      if (!executionResult.success) {
        throw new Error(toCodedActionFailureMessage(executionResult.message));
      }

      const waitResult = await waitForTabSettled(
        client,
        targetTabId,
        normalizedOptions.waitForNavigationMs,
        baseline
      );
      const outcome = combineOutcomeSignals(executionResult.outcome, waitResult);
      if (requiresObservableOutcome(input) && (!outcome || !outcome.observed)) {
        throw browserToolError(
          'NO_OBSERVABLE_EFFECT',
          `Action "${input.type}" completed but no observable page or element change was detected`
        );
      }

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
          url: tab.url || executionResult.url,
          title: tab.title || executionResult.title,
        },
        message: executionResult.message,
        ...(input.target !== undefined ? { target: input.target } : {}),
        ...(executionResult.value !== undefined ? { value: executionResult.value } : {}),
        ...(executionResult.element !== undefined ? { element: executionResult.element } : {}),
        ...(outcome ? { outcome } : {}),
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
