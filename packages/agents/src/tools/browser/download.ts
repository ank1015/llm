import { connect, type ConnectOptions } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import type { AgentTool } from '@ank1015/llm-sdk';

const downloadSchema = Type.Object({
  url: Type.String({
    description: 'Public file URL to download (pdf, image, or any file URL).',
  }),
  directory: Type.Optional(
    Type.String({
      description:
        'Optional subdirectory under the browser default Downloads folder (for example: reports/2026).',
    })
  ),
  filename: Type.Optional(
    Type.String({
      description: 'Optional filename override (for example: invoice.pdf).',
    })
  ),
});

export type DownloadToolInput = Static<typeof downloadSchema>;

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
}

interface ChromeDownloadItem {
  id?: number;
  filename?: string;
  state?: string;
}

interface DownloadChromeClient {
  call: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export interface DownloadTab {
  tabId: number;
  url: string;
  title: string;
}

export interface DownloadToolDetails {
  downloadId: number;
  url: string;
  filename: string;
  windowId: number;
  state?: string;
  finalFilename?: string;
  tab?: DownloadTab;
}

export interface DownloadOperations {
  getClient: () => Promise<DownloadChromeClient>;
}

export interface DownloadToolOptions {
  /** Browser window scope used for all operations in this tool instance */
  windowId: number;
  /** Options passed to @ank1015/llm-extension connect() */
  connectOptions?: ConnectOptions;
  /** Custom operations for testing or alternative transports */
  operations?: DownloadOperations;
}

function createDefaultGetClient(
  connectOptions?: ConnectOptions
): () => Promise<DownloadChromeClient> {
  let clientPromise: Promise<DownloadChromeClient> | undefined;

  return async () => {
    if (!clientPromise) {
      clientPromise = connect({ launch: true, ...connectOptions });
    }
    return clientPromise;
  };
}

async function callChrome<T>(
  client: DownloadChromeClient,
  method: string,
  ...args: unknown[]
): Promise<T> {
  return (await client.call(method, ...args)) as T;
}

function sanitizeFilename(filename: string): string {
  const normalized = filename.trim();
  if (!normalized) {
    throw new Error('filename cannot be empty');
  }

  const withoutControls = [...normalized]
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');

  const cleaned = withoutControls
    .replaceAll('/', '-')
    .replaceAll('\\', '-')
    .replace(/[<>:"|?*]/gu, '_')
    .replace(/\s+/gu, ' ')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error(`Invalid filename: ${filename}`);
  }

  return cleaned;
}

function sanitizeDirectory(directory: string): string {
  const normalized = directory.trim();
  if (!normalized) {
    throw new Error('directory cannot be empty');
  }
  if (normalized.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(normalized)) {
    throw new Error('directory must be a relative path inside Downloads');
  }

  const segments = normalized
    .split(/[\\/]+/u)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (segment === '.' || segment === '..') {
        throw new Error('directory cannot contain "." or ".." segments');
      }
      return sanitizeFilename(segment);
    });

  if (segments.length === 0) {
    throw new Error('directory cannot be empty');
  }

  return segments.join('/');
}

function getFilenameFromUrl(url: string): string {
  const parsed = new URL(url);
  const lastPathSegment = parsed.pathname.split('/').pop();
  if (!lastPathSegment) {
    return 'download';
  }

  try {
    const decoded = decodeURIComponent(lastPathSegment);
    return sanitizeFilename(decoded || 'download');
  } catch {
    return sanitizeFilename(lastPathSegment);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function findActiveTab(
  client: DownloadChromeClient,
  windowId: number
): Promise<DownloadTab | undefined> {
  const activeTabs = await callChrome<ChromeTab[]>(client, 'tabs.query', {
    active: true,
    windowId,
  });
  const active = activeTabs[0];

  if (!active || typeof active.id !== 'number') {
    return undefined;
  }

  return {
    tabId: active.id,
    url: active.url ?? '',
    title: active.title ?? '',
  };
}

export function createDownloadTool(options: DownloadToolOptions): AgentTool<typeof downloadSchema> {
  if (!Number.isInteger(options.windowId) || options.windowId <= 0) {
    throw new Error('createDownloadTool requires a positive integer windowId');
  }

  const windowId = options.windowId;
  const getClient = options.operations?.getClient ?? createDefaultGetClient(options.connectOptions);

  return {
    name: 'download',
    label: 'download',
    description:
      'Download a file URL through Chrome downloads API into the browser Downloads folder (optionally under a subdirectory). Throws if requested filename already exists in download history.',
    parameters: downloadSchema,
    execute: async (_toolCallId: string, { url, directory, filename }: DownloadToolInput) => {
      // Validate URL format early for clearer error messages.
      // Only absolute URLs are supported by downloads.download.
      new URL(url);

      const client = await getClient();
      const resolvedFilename = filename ? sanitizeFilename(filename) : getFilenameFromUrl(url);
      const resolvedDirectory = directory ? sanitizeDirectory(directory) : undefined;
      const requestedFilename = resolvedDirectory
        ? `${resolvedDirectory}/${resolvedFilename}`
        : resolvedFilename;

      const existing = await callChrome<ChromeDownloadItem[]>(client, 'downloads.search', {
        filenameRegex: escapeRegex(requestedFilename),
      });
      const conflicting = existing.some((item) => {
        if (typeof item.filename !== 'string') {
          return false;
        }

        const normalized = item.filename.replaceAll('\\', '/');
        return normalized.endsWith(`/${requestedFilename}`) || normalized === requestedFilename;
      });
      if (conflicting) {
        throw new Error(
          `Download conflict: "${requestedFilename}" already exists in download history. Choose a different filename or directory.`
        );
      }

      const downloadId = await callChrome<number>(client, 'downloads.download', {
        url,
        filename: requestedFilename,
      });

      if (typeof downloadId !== 'number') {
        throw new Error('downloads.download did not return a numeric download id');
      }

      const matches = await callChrome<ChromeDownloadItem[]>(client, 'downloads.search', {
        id: downloadId,
      });
      const item = matches[0];
      const activeTab = await findActiveTab(client, windowId);

      return {
        content: [
          {
            type: 'text',
            content: `Started download ${downloadId} from ${url}\nRequested filename: ${requestedFilename}`,
          },
        ],
        details: {
          downloadId,
          url,
          filename: requestedFilename,
          windowId,
          ...(item?.state ? { state: item.state } : {}),
          ...(item?.filename ? { finalFilename: item.filename } : {}),
          ...(activeTab ? { tab: activeTab } : {}),
        },
      };
    },
  };
}
