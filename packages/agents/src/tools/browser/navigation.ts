import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import { browserToolError } from './errors.js';

import type { AgentTool } from '@ank1015/llm-sdk';

const navigationActionSchema = Type.Union([
  Type.Literal('open_url'),
  Type.Literal('open_url_new_tab'),
  Type.Literal('back'),
  Type.Literal('forward'),
  Type.Literal('reload'),
  Type.Literal('switch_tab'),
  Type.Literal('close_tab'),
  Type.Literal('list_tabs'),
  Type.Literal('get_active_tab'),
]);

export type NavigationAction = Static<typeof navigationActionSchema>;

const navigationSchema = Type.Object({
  action: navigationActionSchema,
  url: Type.Optional(
    Type.String({
      description: 'URL for open_url and open_url_new_tab actions',
    })
  ),
  tabId: Type.Optional(
    Type.Number({
      description:
        'Target tab ID for back, forward, reload, switch_tab, or close_tab. If omitted, uses active tab in the scoped window.',
    })
  ),
});

export type NavigationToolInput = Static<typeof navigationSchema>;

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  status?: string;
  windowId?: number;
  active?: boolean;
}

interface NavigationChromeClient {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export interface NavigationTab {
  tabId: number;
  url: string;
  title: string;
}

export interface NavigationToolDetails {
  action: NavigationAction;
  tab: NavigationTab;
  tabs?: NavigationTab[];
  windowId: number;
}

export interface NavigationOperations {
  getClient: () => Promise<NavigationChromeClient>;
}

export interface NavigationToolOptions {
  /** Browser window scope used for all operations in this tool instance */
  windowId: number;
  /** Options passed to @ank1015/llm-extension connect() */
  connectOptions?: ConnectOptions;
  /** Custom operations for testing or alternative transports */
  operations?: NavigationOperations;
}

const NAVIGATION_SETTLE_TIMEOUT_MS = 15000;
const NAVIGATION_POLL_INTERVAL_MS = 150;
const NAVIGATION_STABLE_POLLS = 2;

function createDefaultGetClient(
  connectOptions?: ConnectOptions
): () => Promise<NavigationChromeClient> {
  let clientPromise: Promise<NavigationChromeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = connect({ launch: true, ...connectOptions });
    }
    return clientPromise;
  };
}

async function callChrome<T>(
  client: NavigationChromeClient,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return (await client.call(method, ...args)) as T;
}

function toNavigationTab(tab: ChromeTab): NavigationTab {
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

async function listTabs(client: NavigationChromeClient, windowId: number): Promise<ChromeTab[]> {
  return await callChrome<ChromeTab[]>(client, 'tabs.query', { windowId });
}

async function findActiveTab(
  client: NavigationChromeClient,
  windowId: number
): Promise<ChromeTab | undefined> {
  const activeTabs = await callChrome<ChromeTab[]>(client, 'tabs.query', {
    active: true,
    windowId,
  });
  if (activeTabs.length > 0) {
    return activeTabs[0];
  }

  const tabs = await listTabs(client, windowId);
  return tabs[0];
}

function formatTabLine(tab: NavigationTab): string {
  return `Tab ${tab.tabId}: ${tab.title || '(untitled)'}\nURL: ${tab.url || '(empty)'}`;
}

function ensureTabId(tab: ChromeTab): number {
  if (typeof tab.id !== 'number') {
    throw browserToolError('TAB_ID_MISSING', 'Tab id is missing');
  }
  return tab.id;
}

function isMeaningfulNavigationUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  const normalized = url.trim().toLowerCase();
  if (!normalized || normalized === 'about:blank') {
    return false;
  }

  return true;
}

async function waitForNavigationSettled(
  client: NavigationChromeClient,
  tabId: number,
  timeoutMs = NAVIGATION_SETTLE_TIMEOUT_MS
): Promise<ChromeTab> {
  const start = Date.now();
  let lastSignature = '';
  let stableCount = 0;
  let latest: ChromeTab | undefined;

  while (Date.now() - start < timeoutMs) {
    const current = await callChrome<ChromeTab>(client, 'tabs.get', tabId);
    latest = current;

    const status = current.status ?? 'complete';
    const url = current.url ?? '';
    const title = current.title ?? '';
    const signature = `${status}|${url}|${title}`;

    if (signature === lastSignature) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastSignature = signature;
    }

    const ready = status === 'complete' && isMeaningfulNavigationUrl(url);
    if (ready && stableCount >= NAVIGATION_STABLE_POLLS) {
      return current;
    }

    await new Promise((resolve) => setTimeout(resolve, NAVIGATION_POLL_INTERVAL_MS));
  }

  if (latest) {
    const status = latest.status ?? 'complete';
    const url = latest.url ?? '(empty)';
    throw browserToolError(
      'NAVIGATION_TIMEOUT',
      `Navigation did not settle for tab ${tabId} within ${timeoutMs}ms (status=${status}, url=${url})`,
      { retryable: true }
    );
  }

  throw browserToolError(
    'NAVIGATION_TIMEOUT',
    `Navigation did not settle for tab ${tabId} within ${timeoutMs}ms`,
    { retryable: true }
  );
}

async function getTargetTab(
  client: NavigationChromeClient,
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
    throw browserToolError('TAB_NOT_FOUND', `No target tab found in window ${windowId}`);
  }
  return activeTab;
}

export function createNavigationTool(
  options: NavigationToolOptions
): AgentTool<typeof navigationSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw browserToolError(
      'INVALID_INPUT',
      'createNavigationTool requires a positive integer windowId'
    );
  }

  const windowId = options.windowId;
  const getClient = options.operations?.getClient ?? createDefaultGetClient(options.connectOptions);

  return {
    name: 'navigation',
    label: 'navigation',
    description:
      'Browser navigation tool scoped to one browser window. Actions: open_url, open_url_new_tab, back, forward, reload, switch_tab, close_tab, list_tabs, get_active_tab.',
    parameters: navigationSchema,
    execute: async (_toolCallId: string, { action, url, tabId }: NavigationToolInput) => {
      const client = await getClient();

      if ((action === 'open_url' || action === 'open_url_new_tab') && !url) {
        throw browserToolError('INVALID_INPUT', `action "${action}" requires a url`);
      }

      let resultTab: NavigationTab;
      let allTabs: NavigationTab[] | undefined;

      switch (action) {
        case 'open_url': {
          const activeTab = await findActiveTab(client, windowId);
          if (activeTab) {
            const activeTabId = ensureTabId(activeTab);
            await callChrome<ChromeTab>(client, 'tabs.update', activeTabId, {
              url,
            });
            const settledTab = await waitForNavigationSettled(client, activeTabId);
            resultTab = toNavigationTab(settledTab);
          } else {
            const createdTab = await callChrome<ChromeTab>(client, 'tabs.create', {
              url,
              active: true,
              windowId,
            });
            const createdTabId = ensureTabId(createdTab);
            const settledTab = await waitForNavigationSettled(client, createdTabId);
            resultTab = toNavigationTab(settledTab);
          }
          break;
        }

        case 'open_url_new_tab': {
          const createdTab = await callChrome<ChromeTab>(client, 'tabs.create', {
            url,
            active: true,
            windowId,
          });
          const createdTabId = ensureTabId(createdTab);
          const settledTab = await waitForNavigationSettled(client, createdTabId);
          resultTab = toNavigationTab(settledTab);
          break;
        }

        case 'back': {
          const targetTab = await getTargetTab(client, windowId, tabId);
          const targetTabId = ensureTabId(targetTab);
          await callChrome<unknown>(client, 'tabs.goBack', targetTabId);
          const refreshedTab = await waitForNavigationSettled(client, targetTabId);
          resultTab = toNavigationTab(refreshedTab);
          break;
        }

        case 'forward': {
          const targetTab = await getTargetTab(client, windowId, tabId);
          const targetTabId = ensureTabId(targetTab);
          await callChrome<unknown>(client, 'tabs.goForward', targetTabId);
          const refreshedTab = await waitForNavigationSettled(client, targetTabId);
          resultTab = toNavigationTab(refreshedTab);
          break;
        }

        case 'reload': {
          const targetTab = await getTargetTab(client, windowId, tabId);
          const targetTabId = ensureTabId(targetTab);
          await callChrome<unknown>(client, 'tabs.reload', targetTabId);
          const refreshedTab = await waitForNavigationSettled(client, targetTabId);
          resultTab = toNavigationTab(refreshedTab);
          break;
        }

        case 'switch_tab': {
          if (typeof tabId !== 'number') {
            throw browserToolError('INVALID_INPUT', 'action "switch_tab" requires tabId');
          }

          await getTargetTab(client, windowId, tabId);
          const updatedTab = await callChrome<ChromeTab>(client, 'tabs.update', tabId, {
            active: true,
          });
          await callChrome<unknown>(client, 'windows.update', windowId, { focused: true });
          resultTab = toNavigationTab(updatedTab);
          break;
        }

        case 'close_tab': {
          const targetTab = await getTargetTab(client, windowId, tabId);
          const targetTabId = ensureTabId(targetTab);
          resultTab = toNavigationTab(targetTab);
          await callChrome<unknown>(client, 'tabs.remove', targetTabId);
          break;
        }

        case 'list_tabs': {
          const tabs = await listTabs(client, windowId);
          const tabSummaries = tabs
            .filter((tab) => typeof tab.id === 'number')
            .map((tab) => toNavigationTab(tab));

          if (tabSummaries.length === 0) {
            throw browserToolError('TAB_NOT_FOUND', `No tabs available in window ${windowId}`);
          }

          const active = tabs.find((tab) => tab.active && typeof tab.id === 'number');
          resultTab = active ? toNavigationTab(active) : tabSummaries[0]!;
          allTabs = tabSummaries;
          break;
        }

        case 'get_active_tab': {
          const activeTab = await findActiveTab(client, windowId);
          if (!activeTab) {
            throw browserToolError('TAB_NOT_FOUND', `No active tab found in window ${windowId}`);
          }
          resultTab = toNavigationTab(activeTab);
          break;
        }
      }

      const lines: string[] = [`Action: ${action}`, formatTabLine(resultTab)];

      if (allTabs) {
        lines.push('', `Tabs (${allTabs.length}):`);
        lines.push(
          ...allTabs.map(
            (tab) => `- ${tab.tabId}: ${tab.title || '(untitled)'} (${tab.url || '(empty)'})`
          )
        );
      }

      return {
        content: [{ type: 'text', content: lines.join('\n') }],
        details: {
          action,
          tab: resultTab,
          ...(allTabs ? { tabs: allTabs } : {}),
          windowId,
        },
      };
    },
  };
}
