#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function sanitizeFileSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';
}

async function waitForTabLoad(chrome, tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.call('tabs.get', tabId);
    if (tab && typeof tab === 'object' && tab.status === 'complete') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}

async function main() {
  const rawUrl = process.argv[2] === '--' ? process.argv[3] : process.argv[2];
  if (!rawUrl) {
    process.stderr.write(
      'Usage: pnpm --filter @ank1015/llm-agents inspect:page -- <url>\n' +
        'Example: pnpm --filter @ank1015/llm-agents inspect:page -- https://example.com\n'
    );
    process.exit(1);
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    process.stderr.write(`Invalid URL: ${rawUrl}\n`);
    process.exit(1);
  }

  let createInspectTool;
  try {
    ({ createInspectTool } = await import('../dist/index.js'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      'Could not load ../dist/index.js. Build @ank1015/llm-agents first.\n' +
        'Run: pnpm --filter @ank1015/llm-agents build\n' +
        `Details: ${message}\n`
    );
    process.exit(1);
  }

  let connect;
  try {
    ({ connect } = await import('@ank1015/llm-extension'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      'Could not load @ank1015/llm-extension. Build it first.\n' +
        'Run: pnpm --filter @ank1015/llm-extension build\n' +
        `Details: ${message}\n`
    );
    process.exit(1);
  }

  const chromePort = process.env.CHROME_RPC_PORT
    ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
    : undefined;
  const connectOptions = chromePort ? { port: chromePort } : undefined;
  const chrome = await connect({ launch: true, ...connectOptions });

  let createdWindowId;
  try {
    const createdWindow = await chrome.call('windows.create', {
      url: url.toString(),
      focused: false,
    });

    if (!createdWindow || typeof createdWindow !== 'object' || typeof createdWindow.id !== 'number') {
      throw new Error('windows.create did not return a valid window id');
    }
    createdWindowId = createdWindow.id;

    const activeTabs = await chrome.call('tabs.query', {
      active: true,
      windowId: createdWindowId,
    });
    const tabId = Array.isArray(activeTabs) ? activeTabs[0]?.id : undefined;
    if (typeof tabId !== 'number') {
      throw new Error(`No active tab found in window ${createdWindowId}`);
    }

    await waitForTabLoad(chrome, tabId);

    const inspectTool = createInspectTool({
      windowId: createdWindowId,
      connectOptions,
    });

    const result = await inspectTool.execute('inspect-script', {
      tabId,
    });

    const markdown = Array.isArray(result.content)
      ? result.content.find((block) => block.type === 'text')?.content
      : undefined;
    if (typeof markdown !== 'string' || markdown.length === 0) {
      throw new Error('inspect_page returned no markdown content');
    }

    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const timestamp = formatTimestamp();
    const host = sanitizeFileSegment(url.hostname);
    const outputFileName = `inspect-${host}-${timestamp}.md`;
    const outputPath = path.join(scriptDir, outputFileName);

    await writeFile(outputPath, markdown, 'utf-8');

    process.stdout.write(
      `Inspection complete.\n` +
        `URL: ${url.toString()}\n` +
        `Output: ${outputPath}\n`
    );
  } finally {
    if (typeof createdWindowId === 'number') {
      try {
        await chrome.call('windows.remove', createdWindowId);
      } catch {
        // Ignore cleanup failures.
      }
    }
  }

  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
