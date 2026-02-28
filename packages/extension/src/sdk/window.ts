import { connect } from './connect.js';
import {
  buildObserveScript,
  createObserveView,
  normalizeObserveOptions,
  parseObserveSnapshot,
  persistObserveSnapshot,
  renderObserveMarkdown,
} from './observe/index.js';

import type { ChromeClient } from './client.js';
import type { WindowObserveOptions } from './observe/index.js';

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
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

export type { ObserveFilter, WindowObserveOptions } from './observe/index.js';
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

  async current(): Promise<WindowTab | null> {
    const chrome = await this.getChrome();
    const windowId = await this.getWindowId();

    const tabs = (await chrome.call('tabs.query', {
      windowId,
      active: true,
    })) as WindowTab[];

    return tabs[0] ?? null;
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
