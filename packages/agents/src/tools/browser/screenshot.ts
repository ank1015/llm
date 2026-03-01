import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import type { AgentTool } from '@ank1015/llm-sdk';

const screenshotFormatSchema = Type.Union([Type.Literal('png'), Type.Literal('jpeg')]);

const screenshotSchema = Type.Object({
  tabId: Type.Optional(
    Type.Number({
      description:
        'Optional tab id to capture. If omitted, captures the active tab in the scoped window.',
    })
  ),
  format: Type.Optional(screenshotFormatSchema),
});

export type ScreenshotToolInput = Static<typeof screenshotSchema>;

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
  windowId?: number;
  active?: boolean;
}

interface ScreenshotChromeClient {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export interface ScreenshotTab {
  tabId: number;
  url: string;
  title: string;
}

export interface ScreenshotToolDetails {
  tab: ScreenshotTab;
  windowId: number;
  mimeType: string;
  bytes: number;
}

export interface ScreenshotOperations {
  getClient: () => Promise<ScreenshotChromeClient>;
}

export interface ScreenshotToolOptions {
  /** Browser window scope used for all operations in this tool instance */
  windowId: number;
  /** Options passed to @ank1015/llm-extension connect() */
  connectOptions?: ConnectOptions;
  /** Custom operations for testing or alternative transports */
  operations?: ScreenshotOperations;
}

const DEFAULT_JPEG_QUALITY = 90;

function createDefaultGetClient(
  connectOptions?: ConnectOptions
): () => Promise<ScreenshotChromeClient> {
  let clientPromise: Promise<ScreenshotChromeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = connect({ launch: true, ...connectOptions });
    }
    return clientPromise;
  };
}

async function callChrome<T>(
  client: ScreenshotChromeClient,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return (await client.call(method, ...args)) as T;
}

function toScreenshotTab(tab: ChromeTab): ScreenshotTab {
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
  client: ScreenshotChromeClient,
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
  client: ScreenshotChromeClient,
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

function decodeCapture(
  captureResult: string,
  requestedFormat: 'png' | 'jpeg'
): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(captureResult);
  if (match?.[1] && match[2]) {
    const mimeType = match[1];
    const data = match[2];
    return { mimeType, data };
  }

  return {
    mimeType: requestedFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
    data: captureResult,
  };
}

export function createScreenshotTool(
  options: ScreenshotToolOptions
): AgentTool<typeof screenshotSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw new Error('createScreenshotTool requires a positive integer windowId');
  }

  const windowId = options.windowId;
  const getClient = options.operations?.getClient ?? createDefaultGetClient(options.connectOptions);

  return {
    name: 'screenshot',
    label: 'screenshot',
    description:
      'Capture a screenshot of a tab in the scoped window. Defaults to the active tab when tabId is omitted.',
    parameters: screenshotSchema,
    execute: async (_toolCallId: string, { tabId, format }: ScreenshotToolInput) => {
      const client = await getClient();
      const requestedFormat = format ?? 'png';

      const targetTab = await getTargetTab(client, windowId, tabId);
      const targetTabId = targetTab.id;

      if (typeof targetTabId !== 'number') {
        throw new Error('Target tab id is missing');
      }

      await callChrome<ChromeTab>(client, 'tabs.update', targetTabId, { active: true });
      await callChrome<unknown>(client, 'windows.update', windowId, { focused: true });

      const captureOptions =
        requestedFormat === 'jpeg'
          ? { format: 'jpeg', quality: DEFAULT_JPEG_QUALITY }
          : { format: 'png' };

      const captureResult = await callChrome<string>(
        client,
        'tabs.captureVisibleTab',
        windowId,
        captureOptions
      );

      const refreshedTab = await callChrome<ChromeTab>(client, 'tabs.get', targetTabId);
      const tabSummary = toScreenshotTab(refreshedTab);
      const decoded = decodeCapture(captureResult, requestedFormat);
      const bytes = Buffer.byteLength(decoded.data, 'base64');

      return {
        content: [
          {
            type: 'text',
            content: `Captured screenshot for tab ${tabSummary.tabId}: ${tabSummary.title || '(untitled)'}`,
          },
          {
            type: 'image',
            data: decoded.data,
            mimeType: decoded.mimeType,
          },
        ],
        details: {
          tab: tabSummary,
          windowId,
          mimeType: decoded.mimeType,
          bytes,
        },
      };
    },
  };
}
