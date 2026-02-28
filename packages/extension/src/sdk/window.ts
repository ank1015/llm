import {
  OBSERVE_BEFORE_ACT_MESSAGE,
  buildActionScript,
  buildSelectorCandidates,
  parseActionExecutionResult,
  resolveObservedTarget,
  summarizeActionDomChanges,
} from './action/index.js';
import { connect } from './connect.js';
import {
  buildObserveScript,
  createObserveView,
  normalizeObserveOptions,
  parseObserveSnapshot,
  persistObserveSnapshot,
  readLatestObserveSnapshot,
  renderObserveMarkdown,
} from './observe/index.js';

import type {
  WindowActionScriptPayload,
  WindowActionOptions,
  WindowScrollOptions,
  WindowTargetActionType,
  WindowTypeOptions,
} from './action/index.js';
import type { ChromeClient } from './client.js';
import type { ObserveSnapshot, WindowObserveOptions } from './observe/index.js';

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_ACTION_TIMEOUT_MS = 15_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 120_000;
const DEFAULT_GET_PAGE_TIMEOUT_MS = 30_000;
const DEFAULT_HTML_CONVERTER_URL = 'http://localhost:8080/convert';
const GET_PAGE_SERVICE_ERROR = 'service not running use observe tool';
const TAB_POLL_INTERVAL_MS = 100;
const TAB_SETTLE_DELAY_MS = 200;

export interface WindowOpenOptions {
  newTab?: boolean;
  active?: boolean;
  tabId?: number;
  timeoutMs?: number;
}

export interface WindowScreenshotOptions {
  tabId?: number;
  /** Capture full-page screenshot when true. Default: false (viewport only). */
  fullPage?: boolean;
}

export interface WindowEvaluateOptions {
  tabId?: number;
  timeoutMs?: number;
}

export interface WindowDownloadOptions {
  timeoutMs?: number;
  saveAs?: boolean;
}

export interface WindowGetPageOptions {
  tabId?: number;
  url?: string;
  timeoutMs?: number;
  converterUrl?: string;
}

export type { ObserveFilter, WindowObserveOptions } from './observe/index.js';
export type {
  WindowActionOptions,
  WindowScrollBehavior,
  WindowScrollOptions,
  WindowTypeOptions,
} from './action/index.js';
export type WindowSemanticFilter = (input: string) => string | Promise<string>;

export interface WindowTab {
  id?: number;
  windowId?: number;
  active?: boolean;
  status?: string;
  url?: string;
  title?: string;
}

interface DebuggerEvaluateResult {
  result?: unknown;
}

interface DownloadItem {
  id?: number;
  filename?: string;
  state?: 'in_progress' | 'interrupted' | 'complete';
  error?: string;
}

/**
 * Agent-facing window wrapper.
 *
 * If a window ID is provided, it is used directly.
 * Otherwise, a new Chrome window is created during initialization.
 */
export class Window {
  private chromePromise: Promise<ChromeClient> | null = null;
  private semanticFilter: WindowSemanticFilter;
  private windowId: number | null = null;

  /** Resolves when constructor initialization completes. */
  readonly ready: Promise<void>;

  constructor(windowId?: number | WindowSemanticFilter, semanticFilter?: WindowSemanticFilter) {
    const resolvedWindowId = typeof windowId === 'number' ? windowId : undefined;
    const resolvedSemanticFilter =
      (typeof windowId === 'function' ? windowId : semanticFilter) ?? ((input: string) => input);

    this.semanticFilter = resolvedSemanticFilter;

    if (typeof resolvedWindowId === 'number') {
      this.windowId = resolvedWindowId;
      this.ready = Promise.resolve();
      return;
    }

    this.ready = (async () => {
      const chrome = await this.getChrome();
      const created = (await chrome.call('windows.create', {})) as { id?: number };

      if (typeof created?.id !== 'number') {
        throw new Error('Failed to create Chrome window');
      }

      this.windowId = created.id;
    })();
  }

  async open(url: string, options?: WindowOpenOptions): Promise<WindowTab> {
    if (!url) {
      throw new Error('open requires a non-empty URL');
    }

    const chrome = await this.getChrome();
    const windowId = await this.getWindowId();
    const active = options?.active ?? true;
    const timeoutMs = options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    let targetTabId: number;

    if (typeof options?.tabId === 'number') {
      targetTabId = options.tabId;
      await this.assertTabInWindow(targetTabId);
      await chrome.call('tabs.update', targetTabId, { url, active });
    } else if (options?.newTab === true) {
      const created = (await chrome.call('tabs.create', {
        windowId,
        url,
        active,
      })) as WindowTab;

      if (typeof created.id !== 'number') {
        throw new Error('Failed to create tab');
      }

      targetTabId = created.id;
    } else {
      const current = await this.current();

      if (typeof current?.id === 'number') {
        targetTabId = current.id;
        await chrome.call('tabs.update', targetTabId, { url, active });
      } else {
        const created = (await chrome.call('tabs.create', {
          windowId,
          url,
          active,
        })) as WindowTab;

        if (typeof created.id !== 'number') {
          throw new Error('Failed to create tab');
        }

        targetTabId = created.id;
      }
    }

    await this.waitForTabLoad(targetTabId, timeoutMs);
    return this.assertTabInWindow(targetTabId);
  }

  async tabs(): Promise<WindowTab[]> {
    const chrome = await this.getChrome();
    const windowId = await this.getWindowId();

    return (await chrome.call('tabs.query', { windowId })) as WindowTab[];
  }

  async switchTab(tabId: number): Promise<WindowTab> {
    const chrome = await this.getChrome();

    await this.assertTabInWindow(tabId);
    await chrome.call('tabs.update', tabId, { active: true });
    await this.waitForTabLoad(tabId);

    return this.assertTabInWindow(tabId);
  }

  async closeTab(tabId?: number): Promise<void> {
    const chrome = await this.getChrome();
    const targetTabId = await this.resolveTargetTabId(tabId);

    await chrome.call('tabs.remove', targetTabId);
    await this.waitForTabClosed(targetTabId);
  }

  async back(tabId?: number): Promise<WindowTab> {
    const chrome = await this.getChrome();
    const targetTabId = await this.resolveTargetTabId(tabId);

    try {
      await chrome.call('tabs.goBack', targetTabId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // `tabs.goBack` may fail even when history APIs are available.
      // Fall back to a direct history.back() in the page context.
      if (
        message.includes('Cannot find a previous page in history') ||
        message.includes('Cannot find a next page in history')
      ) {
        await chrome.call('debugger.evaluate', {
          tabId: targetTabId,
          code: 'history.back(); "ok";',
        });
      } else {
        throw error;
      }
    }
    await this.waitForTabLoad(targetTabId);

    return this.assertTabInWindow(targetTabId);
  }

  async reload(tabId?: number): Promise<WindowTab> {
    const chrome = await this.getChrome();
    const targetTabId = await this.resolveTargetTabId(tabId);

    await chrome.call('tabs.reload', targetTabId);
    await this.waitForTabLoad(targetTabId);

    return this.assertTabInWindow(targetTabId);
  }

  async screenshot(options?: WindowScreenshotOptions): Promise<string> {
    const chrome = await this.getChrome();
    const targetTabId = await this.resolveTargetTabId(options?.tabId);
    const fullPage = options?.fullPage ?? false;

    await this.waitForTabLoad(targetTabId);

    let attachedByThisMethod = false;

    try {
      const attachResult = (await chrome.call('debugger.attach', {
        tabId: targetTabId,
      })) as { attached?: boolean; alreadyAttached?: boolean };

      attachedByThisMethod = attachResult.attached === true;

      await chrome.call('debugger.sendCommand', {
        tabId: targetTabId,
        method: 'Page.enable',
      });

      const params = fullPage
        ? await this.getFullPageCaptureParams(targetTabId)
        : {
            format: 'png',
          };

      const result = (await chrome.call('debugger.sendCommand', {
        tabId: targetTabId,
        method: 'Page.captureScreenshot',
        params,
      })) as { data?: string };

      if (typeof result.data !== 'string' || result.data.length === 0) {
        throw new Error('Screenshot capture returned no image data');
      }

      return result.data;
    } finally {
      if (attachedByThisMethod) {
        try {
          await chrome.call('debugger.detach', { tabId: targetTabId });
        } catch {
          // Ignore detach errors (tab may have closed)
        }
      }
    }
  }

  async download(
    url: string,
    downloadPath: string,
    options?: WindowDownloadOptions
  ): Promise<string> {
    if (!url.trim()) {
      throw new Error('download requires a non-empty url');
    }

    if (!downloadPath.trim()) {
      throw new Error('download requires a non-empty downloadPath');
    }

    const chrome = await this.getChrome();

    const downloadId = (await chrome.call('downloads.download', {
      url,
      filename: downloadPath,
      saveAs: options?.saveAs ?? false,
    })) as number;

    if (typeof downloadId !== 'number') {
      throw new Error('Failed to start download');
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
    const item = await this.waitForDownloadCompletion(downloadId, timeoutMs);

    if (item.state === 'complete') {
      const resolvedPath = item.filename ?? downloadPath;
      return `Downloaded to ${resolvedPath}`;
    }

    if (item.state === 'interrupted') {
      const reason = item.error ? `: ${item.error}` : '';
      return `Download interrupted${reason}`;
    }

    return 'Download state unknown';
  }

  async evaluate<T = unknown>(code: string, options?: WindowEvaluateOptions): Promise<T> {
    if (!code.trim()) {
      throw new Error('evaluate requires non-empty code');
    }

    const chrome = await this.getChrome();
    const targetTabId = await this.resolveTargetTabId(options?.tabId);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;

    await this.waitForTabLoad(targetTabId, timeoutMs);

    const evaluation = (await chrome.call('debugger.evaluate', {
      tabId: targetTabId,
      code,
    })) as DebuggerEvaluateResult;

    return evaluation.result as T;
  }

  async getPage(input?: WindowGetPageOptions | number | string): Promise<string> {
    const normalizedInput = this.normalizeGetPageInput(input);
    const timeoutMs = normalizedInput.timeoutMs ?? DEFAULT_GET_PAGE_TIMEOUT_MS;
    const converterUrl = normalizedInput.converterUrl ?? DEFAULT_HTML_CONVERTER_URL;

    let targetTabId: number;
    let createdTabId: number | null = null;

    if (typeof normalizedInput.tabId === 'number') {
      targetTabId = await this.resolveTargetTabId(normalizedInput.tabId);
    } else if (normalizedInput.url) {
      const opened = await this.open(normalizedInput.url, {
        newTab: true,
        active: false,
        timeoutMs,
      });

      if (typeof opened.id !== 'number') {
        throw new Error('Failed to open temporary tab for getPage');
      }

      targetTabId = opened.id;
      createdTabId = opened.id;
    } else {
      throw new Error('getPage requires either tabId or url');
    }

    try {
      const html = await this.getCompleteHtml(targetTabId, timeoutMs);
      return await this.convertHtmlToMarkdown(html, converterUrl);
    } finally {
      if (createdTabId !== null) {
        await this.closeTabIfPresent(createdTabId);
      }
    }
  }

  async observe(options?: WindowObserveOptions): Promise<string> {
    const chrome = await this.getChrome();
    const windowId = await this.getWindowId();
    const targetTabId = await this.resolveTargetTabId(options?.tabId);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    await this.waitForTabLoad(targetTabId, timeoutMs);

    const normalizedOptions = normalizeObserveOptions(options);
    const script = buildObserveScript({
      maxInteractive: normalizedOptions.max,
      maxTextBlocks: Math.min(normalizedOptions.max, 120),
    });

    const evaluation = (await chrome.call('debugger.evaluate', {
      tabId: targetTabId,
      code: script,
    })) as DebuggerEvaluateResult;

    const snapshot = parseObserveSnapshot(evaluation.result);
    const persisted = await persistObserveSnapshot({
      windowId,
      tabId: targetTabId,
      snapshot,
      options: normalizedOptions,
    });
    const view = createObserveView(snapshot, normalizedOptions);

    const markdown = renderObserveMarkdown({
      windowId,
      tabId: targetTabId,
      snapshotId: persisted.snapshotId,
      snapshotPath: persisted.snapshotPath,
      options: normalizedOptions,
      snapshot,
      view,
    });

    if (normalizedOptions.semanticFilter) {
      const semanticInput = [
        `Semantic Filter Query: ${normalizedOptions.semanticFilter}`,
        '',
        markdown,
      ].join('\n');
      return await this.semanticFilter(semanticInput);
    }

    return markdown;
  }

  async click(targetId: string, options?: WindowActionOptions): Promise<string> {
    return this.runTargetAction('click', targetId, undefined, options);
  }

  async hover(targetId: string, options?: WindowActionOptions): Promise<string> {
    return this.runTargetAction('hover', targetId, undefined, options);
  }

  async focus(targetId: string, options?: WindowActionOptions): Promise<string> {
    return this.runTargetAction('focus', targetId, undefined, options);
  }

  async pressEnter(targetId: string, options?: WindowActionOptions): Promise<string> {
    return this.runTargetAction('pressEnter', targetId, undefined, options);
  }

  async clear(targetId: string, options?: WindowActionOptions): Promise<string> {
    return this.runTargetAction('clear', targetId, undefined, options);
  }

  async toggle(targetId: string, options?: WindowActionOptions): Promise<string> {
    return this.runTargetAction('toggle', targetId, undefined, options);
  }

  async type(targetId: string, value: string, options?: WindowTypeOptions): Promise<string> {
    if (typeof value !== 'string') {
      throw new Error('type requires value to be a string');
    }

    return this.runTargetAction(
      'type',
      targetId,
      {
        value,
        clearBeforeType: options?.clearBeforeType ?? true,
        pressEnter: options?.pressEnter ?? false,
      },
      options
    );
  }

  async select(targetId: string, value: string, options?: WindowActionOptions): Promise<string> {
    if (typeof value !== 'string') {
      throw new Error('select requires value to be a string');
    }

    return this.runTargetAction('select', targetId, { value }, options);
  }

  async scroll(options?: WindowScrollOptions): Promise<string> {
    const scrollPayload = this.buildScrollPayload(options);

    if (options?.targetId) {
      return this.runTargetAction('scroll', options.targetId, { scroll: scrollPayload }, options);
    }

    return this.runPageAction(
      {
        action: 'scroll',
        selectors: [],
        scroll: scrollPayload,
      },
      options
    );
  }

  async current(): Promise<WindowTab | null> {
    const chrome = await this.getChrome();
    const windowId = await this.getWindowId();

    const tabs = (await chrome.call('tabs.query', {
      windowId,
      active: true,
    })) as WindowTab[];

    return tabs[0] ?? null;
  }

  private async runTargetAction(
    action: WindowTargetActionType | 'scroll',
    targetId: string,
    payload: {
      value?: string;
      clearBeforeType?: boolean;
      pressEnter?: boolean;
      scroll?: {
        x?: number;
        y?: number;
        to?: 'top' | 'bottom' | 'left' | 'right';
        behavior?: 'auto' | 'smooth';
      };
    } = {},
    options?: WindowActionOptions
  ): Promise<string> {
    const normalizedTargetId = targetId.trim();
    if (!normalizedTargetId) {
      throw new Error(`${action} requires a non-empty targetId`);
    }

    const targetTabId = await this.resolveTargetTabId(options?.tabId);
    await this.waitForTabLoad(targetTabId, options?.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);

    const windowId = await this.getWindowId();
    const baselineRecord = await readLatestObserveSnapshot(windowId, targetTabId);
    const resolved = await resolveObservedTarget({
      windowId,
      tabId: targetTabId,
      targetId: normalizedTargetId,
    });

    if (resolved.status === 'observe_required') {
      return OBSERVE_BEFORE_ACT_MESSAGE;
    }

    if (resolved.status === 'target_not_found') {
      return resolved.message;
    }

    const beforeTab = await this.assertTabInWindow(targetTabId);

    const actionPayload: WindowActionScriptPayload = {
      action,
      selectors: buildSelectorCandidates(resolved.target),
    };

    if (typeof payload.value === 'string') {
      actionPayload.value = payload.value;
    }
    if (typeof payload.clearBeforeType === 'boolean') {
      actionPayload.clearBeforeType = payload.clearBeforeType;
    }
    if (typeof payload.pressEnter === 'boolean') {
      actionPayload.pressEnter = payload.pressEnter;
    }
    if (payload.scroll) {
      actionPayload.scroll = payload.scroll;
    }

    const script = buildActionScript(actionPayload);

    const chrome = await this.getChrome();
    const evaluation = (await chrome.call('debugger.evaluate', {
      tabId: targetTabId,
      code: script,
    })) as DebuggerEvaluateResult;

    const execution = parseActionExecutionResult(evaluation.result);

    await this.waitForPostActionLoad(targetTabId, options?.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);

    const afterTab = await this.getTabIfPresent(targetTabId);

    if (!afterTab) {
      return this.renderActionMarkdown({
        action: execution.action || action,
        targetId: normalizedTargetId,
        selectorUsed: execution.selectorUsed,
        success: execution.success,
        actionMessage: execution.message,
        urlBefore: beforeTab.url,
        urlAfter: undefined,
        domDiffLines: ['- Tab is no longer available after action.'],
      });
    }

    if (afterTab.url !== beforeTab.url) {
      return this.renderActionMarkdown({
        action: execution.action || action,
        targetId: normalizedTargetId,
        selectorUsed: execution.selectorUsed,
        success: execution.success,
        actionMessage: execution.message,
        urlBefore: beforeTab.url,
        urlAfter: afterTab.url,
      });
    }

    let domDiffLines: string[] | undefined;
    if (baselineRecord) {
      const afterSnapshot = await this.captureActionSnapshot(targetTabId);
      if (afterSnapshot) {
        domDiffLines = summarizeActionDomChanges(baselineRecord.snapshot, afterSnapshot).lines;
      }
    }

    return this.renderActionMarkdown({
      action: execution.action || action,
      targetId: normalizedTargetId,
      selectorUsed: execution.selectorUsed,
      success: execution.success,
      actionMessage: execution.message,
      urlBefore: beforeTab.url,
      urlAfter: afterTab.url,
      domDiffLines,
    });
  }

  private async runPageAction(
    payload: {
      action: 'scroll';
      selectors: string[];
      scroll: {
        x?: number;
        y?: number;
        to?: 'top' | 'bottom' | 'left' | 'right';
        behavior?: 'auto' | 'smooth';
      };
    },
    options?: WindowActionOptions
  ): Promise<string> {
    const targetTabId = await this.resolveTargetTabId(options?.tabId);
    await this.waitForTabLoad(targetTabId, options?.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);
    const beforeTab = await this.assertTabInWindow(targetTabId);
    const windowId = await this.getWindowId();
    const baselineRecord = await readLatestObserveSnapshot(windowId, targetTabId);

    const script = buildActionScript(payload);
    const chrome = await this.getChrome();
    const evaluation = (await chrome.call('debugger.evaluate', {
      tabId: targetTabId,
      code: script,
    })) as DebuggerEvaluateResult;

    const execution = parseActionExecutionResult(evaluation.result);

    await this.waitForPostActionLoad(targetTabId, options?.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS);

    const afterTab = await this.getTabIfPresent(targetTabId);
    if (!afterTab) {
      return this.renderActionMarkdown({
        action: execution.action || payload.action,
        success: execution.success,
        actionMessage: execution.message,
        urlBefore: beforeTab.url,
        urlAfter: undefined,
        domDiffLines: ['- Tab is no longer available after action.'],
      });
    }

    if (afterTab.url !== beforeTab.url) {
      return this.renderActionMarkdown({
        action: execution.action || payload.action,
        success: execution.success,
        actionMessage: execution.message,
        urlBefore: beforeTab.url,
        urlAfter: afterTab.url,
      });
    }

    let domDiffLines: string[] | undefined;
    if (baselineRecord) {
      const afterSnapshot = await this.captureActionSnapshot(targetTabId);
      if (afterSnapshot) {
        domDiffLines = summarizeActionDomChanges(baselineRecord.snapshot, afterSnapshot).lines;
      }
    }

    return this.renderActionMarkdown({
      action: execution.action || payload.action,
      success: execution.success,
      actionMessage: execution.message,
      urlBefore: beforeTab.url,
      urlAfter: afterTab.url,
      domDiffLines,
    });
  }

  private async waitForPostActionLoad(tabId: number, timeoutMs: number): Promise<void> {
    try {
      await this.waitForTabLoad(tabId, timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        message.includes('No tab with id') ||
        message.includes('No tab exists with id') ||
        message.includes('Tab closed')
      ) {
        return;
      }

      throw error;
    }
  }

  private async captureActionSnapshot(tabId: number): Promise<ObserveSnapshot | null> {
    try {
      const chrome = await this.getChrome();
      const script = buildObserveScript({
        maxInteractive: 120,
        maxTextBlocks: 80,
      });

      const evaluation = (await chrome.call('debugger.evaluate', {
        tabId,
        code: script,
      })) as DebuggerEvaluateResult;

      return parseObserveSnapshot(evaluation.result);
    } catch {
      return null;
    }
  }

  private async getTabIfPresent(tabId: number): Promise<WindowTab | null> {
    try {
      return await this.assertTabInWindow(tabId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('No tab with id') ||
        message.includes('No tab exists with id') ||
        message.includes('Tab closed')
      ) {
        return null;
      }
      throw error;
    }
  }

  private renderActionMarkdown(input: {
    action: string;
    success: boolean;
    actionMessage: string;
    targetId?: string | undefined;
    selectorUsed?: string | undefined;
    urlBefore?: string | undefined;
    urlAfter?: string | undefined;
    domDiffLines?: string[] | undefined;
  }): string {
    const lines: string[] = [];
    const actionTarget = input.targetId ? ` ${input.targetId}` : '';
    const selectorSuffix = input.selectorUsed ? ` (resolved via \`${input.selectorUsed}\`)` : '';
    const status = input.success ? 'success' : 'failed';
    const urlChanged = input.urlAfter !== undefined && input.urlAfter !== input.urlBefore;

    lines.push('### Action Result');
    lines.push(`- Action: ${input.action}${actionTarget}`);
    lines.push(`- Status: ${status}`);
    lines.push(`- Message: ${input.actionMessage}${selectorSuffix}`);

    if (urlChanged) {
      lines.push(`- URL changed to: ${this.formatUrlForOutput(input.urlAfter)}`);
      return lines.join('\n');
    }

    lines.push('- URL: unchanged');

    if (input.domDiffLines && input.domDiffLines.length > 0) {
      lines.push('');
      lines.push('### Detected Changes');
      lines.push(...input.domDiffLines);
    }

    return lines.join('\n');
  }

  private formatUrlForOutput(url?: string): string {
    if (!url) {
      return '(unknown)';
    }

    const trimmed = url.trim();
    if (!trimmed) {
      return '(unknown)';
    }

    if (trimmed.length <= 180) {
      return trimmed;
    }

    return `${trimmed.slice(0, 177)}...`;
  }

  private buildScrollPayload(options?: Pick<WindowScrollOptions, 'x' | 'y' | 'to' | 'behavior'>): {
    x?: number;
    y?: number;
    to?: 'top' | 'bottom' | 'left' | 'right';
    behavior?: 'auto' | 'smooth';
  } {
    const payload: {
      x?: number;
      y?: number;
      to?: 'top' | 'bottom' | 'left' | 'right';
      behavior?: 'auto' | 'smooth';
    } = {};

    if (typeof options?.x === 'number') {
      payload.x = options.x;
    }
    if (typeof options?.y === 'number') {
      payload.y = options.y;
    }
    if (options?.to) {
      payload.to = options.to;
    }
    if (options?.behavior) {
      payload.behavior = options.behavior;
    }

    return payload;
  }

  private normalizeGetPageInput(
    input?: WindowGetPageOptions | number | string
  ): WindowGetPageOptions {
    if (typeof input === 'number') {
      return { tabId: input };
    }

    if (typeof input === 'string') {
      return { url: input };
    }

    if (!input) {
      return {};
    }

    const normalized: WindowGetPageOptions = {};

    if (typeof input.tabId === 'number') {
      normalized.tabId = input.tabId;
    }

    if (typeof input.url === 'string') {
      normalized.url = input.url;
    }

    if (typeof input.timeoutMs === 'number') {
      normalized.timeoutMs = input.timeoutMs;
    }

    if (typeof input.converterUrl === 'string') {
      normalized.converterUrl = input.converterUrl;
    }

    if (normalized.tabId !== undefined && normalized.url !== undefined) {
      throw new Error('getPage accepts either tabId or url, not both');
    }

    return normalized;
  }

  private async getCompleteHtml(tabId: number, timeoutMs: number): Promise<string> {
    const html = await this.evaluate<string>(
      `
(() => {
  const doctype = document.doctype
    ? "<!DOCTYPE " + document.doctype.name + ">"
    : "";
  return doctype + "\\n" + document.documentElement.outerHTML;
})()
      `.trim(),
      { tabId, timeoutMs }
    );

    if (typeof html !== 'string') {
      throw new Error('Failed to read page HTML');
    }

    return html;
  }

  private async convertHtmlToMarkdown(html: string, converterUrl: string): Promise<string> {
    try {
      const response = await fetch(converterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html }),
      });

      if (!response.ok) {
        return GET_PAGE_SERVICE_ERROR;
      }

      const raw = await response.text();
      return this.parseConvertedMarkdown(raw);
    } catch {
      return GET_PAGE_SERVICE_ERROR;
    }
  }

  private parseConvertedMarkdown(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === 'string') {
        return parsed;
      }

      if (parsed && typeof parsed === 'object') {
        const parsedRecord = parsed as Record<string, unknown>;
        if (typeof parsedRecord.markdown === 'string') {
          return parsedRecord.markdown;
        }
        if (typeof parsedRecord.content === 'string') {
          return parsedRecord.content;
        }
        if (typeof parsedRecord.result === 'string') {
          return parsedRecord.result;
        }
      }
    } catch {
      // Converter may return plain text markdown.
    }

    return raw;
  }

  private async closeTabIfPresent(tabId: number): Promise<void> {
    try {
      const chrome = await this.getChrome();
      await chrome.call('tabs.remove', tabId);
      await this.waitForTabClosed(tabId);
    } catch {
      // Ignore close cleanup errors.
    }
  }

  private getChrome(): Promise<ChromeClient> {
    if (!this.chromePromise) {
      this.chromePromise = connect({ launch: true });
    }
    return this.chromePromise;
  }

  private async getWindowId(): Promise<number> {
    await this.ready;

    if (this.windowId === null) {
      throw new Error('Window is not initialized');
    }

    return this.windowId;
  }

  private async resolveTargetTabId(tabId?: number): Promise<number> {
    if (typeof tabId === 'number') {
      await this.assertTabInWindow(tabId);
      return tabId;
    }

    const current = await this.current();
    if (typeof current?.id !== 'number') {
      throw new Error('No active tab found in window');
    }

    return current.id;
  }

  private async assertTabInWindow(tabId: number): Promise<WindowTab> {
    const chrome = await this.getChrome();
    const windowId = await this.getWindowId();
    const tab = (await chrome.call('tabs.get', tabId)) as WindowTab;

    if (tab.windowId !== windowId) {
      throw new Error(`Tab ${tabId} is not in window ${windowId}`);
    }

    return tab;
  }

  private async waitForTabLoad(tabId: number, timeoutMs = DEFAULT_WAIT_TIMEOUT_MS): Promise<void> {
    const chrome = await this.getChrome();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const tab = (await chrome.call('tabs.get', tabId)) as WindowTab;

      if (tab.status === 'complete') {
        await sleep(TAB_SETTLE_DELAY_MS);

        const settled = (await chrome.call('tabs.get', tabId)) as WindowTab;
        if (settled.status === 'complete') {
          return;
        }
      }

      await sleep(TAB_POLL_INTERVAL_MS);
    }

    throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
  }

  private async waitForTabClosed(tabId: number, timeoutMs = 5000): Promise<void> {
    const chrome = await this.getChrome();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        await chrome.call('tabs.get', tabId);
      } catch {
        return;
      }

      await sleep(TAB_POLL_INTERVAL_MS);
    }

    throw new Error(`Tab ${tabId} was not closed within ${timeoutMs}ms`);
  }

  private async waitForDownloadCompletion(
    downloadId: number,
    timeoutMs: number
  ): Promise<DownloadItem> {
    const chrome = await this.getChrome();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const results = (await chrome.call('downloads.search', {
        id: downloadId,
        limit: 1,
      })) as DownloadItem[];
      const item = results[0];

      if (!item) {
        await sleep(TAB_POLL_INTERVAL_MS);
        continue;
      }

      if (item.state === 'complete' || item.state === 'interrupted') {
        return item;
      }

      await sleep(TAB_POLL_INTERVAL_MS);
    }

    throw new Error(`Download ${downloadId} did not finish within ${timeoutMs}ms`);
  }

  private async getFullPageCaptureParams(tabId: number): Promise<{
    format: 'png';
    captureBeyondViewport: boolean;
    clip: {
      x: number;
      y: number;
      width: number;
      height: number;
      scale: number;
    };
  }> {
    const chrome = await this.getChrome();
    const metrics = (await chrome.call('debugger.sendCommand', {
      tabId,
      method: 'Page.getLayoutMetrics',
    })) as {
      contentSize?: { x?: number; y?: number; width?: number; height?: number };
      cssContentSize?: { x?: number; y?: number; width?: number; height?: number };
    };

    const contentSize = metrics.cssContentSize ?? metrics.contentSize;

    if (
      !contentSize ||
      typeof contentSize.width !== 'number' ||
      typeof contentSize.height !== 'number'
    ) {
      throw new Error('Failed to determine page dimensions for full-page screenshot');
    }

    return {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: contentSize.x ?? 0,
        y: contentSize.y ?? 0,
        width: Math.max(1, Math.ceil(contentSize.width)),
        height: Math.max(1, Math.ceil(contentSize.height)),
        scale: 1,
      },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
