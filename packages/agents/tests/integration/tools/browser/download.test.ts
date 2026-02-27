import { connect, type ChromeClient } from '@ank1015/llm-extension';
import { describe, expect, it } from 'vitest';

import {
  createDownloadTool,
  type DownloadToolDetails,
} from '../../../../src/tools/browser/download.js';

interface ChromeWindow {
  id?: number;
}

interface ChromeDownloadItem {
  id?: number;
  state?: string;
}

const runRealDownloadIntegration = true;
const chromePort = process.env.CHROME_RPC_PORT
  ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
  : undefined;
const TEST_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

describe.skipIf(!runRealDownloadIntegration)('download tool real integration', () => {
  it('downloads a real file and returns download metadata', async () => {
    const chrome = await connect(chromePort ? { port: chromePort } : undefined);

    let createdWindowId: number | undefined;
    let downloadId: number | undefined;

    try {
      const createdWindow = (await chrome.call('windows.create', {
        url: 'about:blank',
        focused: false,
      })) as ChromeWindow;

      expect(typeof createdWindow.id).toBe('number');
      createdWindowId = createdWindow.id;

      const downloadTool = createDownloadTool({
        windowId: createdWindowId!,
        connectOptions: chromePort ? { port: chromePort } : undefined,
      });

      const uniqueFilename = `dummy-${Date.now()}.pdf`;
      const result = (await downloadTool.execute('download-1', {
        url: TEST_PDF_URL,
        directory: 'llm-agents-e2e',
        filename: uniqueFilename,
      })) as { details: DownloadToolDetails };

      downloadId = result.details.downloadId;

      expect(result.details.downloadId).toBeGreaterThan(0);
      expect(result.details.windowId).toBe(createdWindowId);
      expect(result.details.filename).toBe(`llm-agents-e2e/${uniqueFilename}`);

      const completed = await waitForDownloadComplete(chrome, result.details.downloadId, 30000);
      expect(completed).toBe(true);
    } finally {
      if (typeof downloadId === 'number') {
        await cleanupDownload(chrome, downloadId);
      }
      if (typeof createdWindowId === 'number') {
        await cleanupWindow(chrome, createdWindowId);
      }
    }
  });
});

async function waitForDownloadComplete(
  chrome: ChromeClient,
  downloadId: number,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const matches = (await chrome.call('downloads.search', {
      id: downloadId,
    })) as ChromeDownloadItem[];
    const item = matches[0];

    if (item?.state === 'complete') {
      return true;
    }
    if (item?.state === 'interrupted') {
      throw new Error(`Download ${downloadId} was interrupted`);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Download ${downloadId} did not complete within ${timeoutMs}ms`);
}

async function cleanupDownload(chrome: ChromeClient, downloadId: number): Promise<void> {
  try {
    await chrome.call('downloads.removeFile', downloadId);
  } catch {
    // ignore (file may already be gone)
  }

  try {
    await chrome.call('downloads.erase', { id: downloadId });
  } catch {
    // ignore cleanup errors
  }
}

async function cleanupWindow(chrome: ChromeClient, windowId: number): Promise<void> {
  try {
    await chrome.call('windows.remove', windowId);
  } catch {
    // ignore cleanup errors
  }
}
