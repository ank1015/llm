import { describe, expect, it, vi } from 'vitest';

import { createDownloadTool } from '../../../../src/tools/browser/download.js';

type MockChromeCall = (method: string, ...args: unknown[]) => Promise<unknown>;

function createMockClient(callImpl: MockChromeCall): { call: MockChromeCall } {
  return {
    call: callImpl,
  };
}

describe('createDownloadTool', () => {
  it('downloads with explicit directory and filename', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'downloads.search') {
        const query = args[0] as { filenameRegex?: string; id?: number };

        if (typeof query.filenameRegex === 'string') {
          return [];
        }

        if (query.id === 42) {
          return [
            {
              id: 42,
              state: 'complete',
              filename: '/Users/me/Downloads/reports/invoice.pdf',
            },
          ];
        }
      }

      if (method === 'downloads.download') {
        return 42;
      }

      if (method === 'tabs.query') {
        const query = args[0] as { active?: boolean; windowId?: number };
        if (query.active && query.windowId === 7001) {
          return [
            {
              id: 11,
              url: 'https://example.com',
              title: 'Example',
            },
          ];
        }
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createDownloadTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('1', {
      url: 'https://files.example.com/invoice.pdf',
      directory: 'reports',
      filename: 'invoice.pdf',
    });

    expect(result.details).toMatchObject({
      downloadId: 42,
      filename: 'reports/invoice.pdf',
      url: 'https://files.example.com/invoice.pdf',
      windowId: 7001,
      state: 'complete',
      finalFilename: '/Users/me/Downloads/reports/invoice.pdf',
      tab: {
        tabId: 11,
        url: 'https://example.com',
        title: 'Example',
      },
    });

    expect(call).toHaveBeenCalledWith('downloads.download', {
      url: 'https://files.example.com/invoice.pdf',
      filename: 'reports/invoice.pdf',
    });
  });

  it('derives filename from url when filename is omitted', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'downloads.download') {
        return 7;
      }

      if (method === 'downloads.search') {
        const query = args[0] as { filenameRegex?: string; id?: number };
        if (typeof query.filenameRegex === 'string') {
          return [];
        }
        if (query.id === 7) {
          return [];
        }
      }

      if (method === 'tabs.query') {
        return [];
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createDownloadTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    const result = await tool.execute('1', {
      url: 'https://example.com/files/data.csv?version=2',
      directory: 'exports',
    });

    expect(result.details).toMatchObject({
      downloadId: 7,
      filename: 'exports/data.csv',
      url: 'https://example.com/files/data.csv?version=2',
      windowId: 7001,
    });
  });

  it('rejects when filename already exists in download history', async () => {
    const call = vi.fn(async (method: string, ...args: unknown[]) => {
      if (method === 'downloads.search') {
        const query = args[0] as { filenameRegex?: string };
        if (typeof query.filenameRegex === 'string') {
          return [
            {
              id: 88,
              filename: '/Users/me/Downloads/reports/invoice.pdf',
              state: 'complete',
            },
          ];
        }
      }

      throw new Error(`Unexpected method call: ${method}`);
    });

    const tool = createDownloadTool({
      windowId: 7001,
      operations: {
        getClient: async () => createMockClient(call),
      },
    });

    await expect(
      tool.execute('1', {
        url: 'https://files.example.com/invoice.pdf',
        directory: 'reports',
        filename: 'invoice.pdf',
      })
    ).rejects.toThrow(
      'Download conflict: "reports/invoice.pdf" already exists in download history'
    );
  });

  it('rejects unsafe directory paths', async () => {
    const tool = createDownloadTool({
      windowId: 7001,
      operations: {
        getClient: async () =>
          createMockClient(async () => {
            throw new Error('should not be called');
          }),
      },
    });

    await expect(
      tool.execute('1', {
        url: 'https://example.com/file.txt',
        directory: '../secret',
      })
    ).rejects.toThrow('directory cannot contain "." or ".." segments');
  });
});
