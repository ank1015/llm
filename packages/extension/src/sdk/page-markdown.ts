const DEFAULT_GET_PAGE_TIMEOUT_MS = 30_000;
const DEFAULT_HTML_CONVERTER_URL = 'http://localhost:8080/convert';
const TAB_POLL_INTERVAL_MS = 100;
const TAB_SETTLE_DELAY_MS = 200;

export interface GetPageMarkdownOptions {
  timeoutMs?: number;
  converterUrl?: string;
}

interface ChromeCaller {
  call(method: string, ...args: unknown[]): Promise<unknown>;
}

interface TabLoadState {
  status?: string;
}

interface DebuggerEvaluateResult {
  result?: unknown;
}

const PAGE_HTML_SCRIPT = `
(() => {
  const doctype = document.doctype
    ? "<!DOCTYPE " + document.doctype.name + ">"
    : "";
  return doctype + "\\n" + document.documentElement.outerHTML;
})()
`.trim();

export async function getPageMarkdownForTab(
  chrome: ChromeCaller,
  tabId: number,
  options?: GetPageMarkdownOptions
): Promise<string> {
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error('getPageMarkdown requires a positive integer tabId');
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_GET_PAGE_TIMEOUT_MS;
  const converterUrl = options?.converterUrl ?? DEFAULT_HTML_CONVERTER_URL;

  await waitForTabLoad(chrome, tabId, timeoutMs);

  const evaluation = (await chrome.call('debugger.evaluate', {
    tabId,
    code: PAGE_HTML_SCRIPT,
    awaitPromise: false,
    userGesture: false,
  })) as DebuggerEvaluateResult;

  if (typeof evaluation.result !== 'string') {
    throw new Error('Failed to read page HTML');
  }

  return await convertHtmlToMarkdown(evaluation.result, converterUrl);
}

async function waitForTabLoad(
  chrome: ChromeCaller,
  tabId: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tab = (await chrome.call('tabs.get', tabId)) as TabLoadState;

    if (tab.status === 'complete') {
      await sleep(TAB_SETTLE_DELAY_MS);

      const settled = (await chrome.call('tabs.get', tabId)) as TabLoadState;
      if (settled.status === 'complete') {
        return;
      }
    }

    await sleep(TAB_POLL_INTERVAL_MS);
  }

  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}

async function convertHtmlToMarkdown(html: string, converterUrl: string): Promise<string> {
  try {
    const response = await fetch(converterUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ html }),
    });

    if (!response.ok) {
      throw new Error(
        `Markdown converter request failed with ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
      );
    }

    const raw = await response.text();
    return parseConvertedMarkdown(raw);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Markdown converter request failed')) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to reach markdown converter at ${converterUrl}: ${message}`);
  }
}

function parseConvertedMarkdown(raw: string): string {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
