# Cookbook

These are reusable TypeScript patterns for `skills/browser-use`.

Assume the installed skill lives under `.max/skills/browser-use/` and any extra throwaway helpers for the current artifact live under `<artifactDir>/.max/temp/browser-use/`.

## Bootstrap

```ts
import { connect } from '@ank1015/llm-extension';

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  console.error('[browser-task] connected');

  // ... workflow ...

  process.exit(0);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
```

## Sleep And Wait For Load

```ts
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabLoad(
  chrome: { call: (method: string, ...args: unknown[]) => Promise<unknown> },
  tabId: number,
  timeoutMs = 45_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tab = (await chrome.call('tabs.get', tabId)) as { status?: string };
    if (tab?.status === 'complete') {
      await sleep(250);
      const settled = (await chrome.call('tabs.get', tabId)) as { status?: string };
      if (settled?.status === 'complete') return;
    }
    await sleep(250);
  }

  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}
```

## Create An Isolated Window And Tab

```ts
const created = (await chrome.call('windows.create', {
  url: 'about:blank',
  focused: true,
  type: 'normal',
})) as { id?: number; tabs?: Array<{ id?: number }> };

const windowId = created.id;
const tabId = created.tabs?.[0]?.id;

if (typeof windowId !== 'number' || typeof tabId !== 'number') {
  throw new Error('Failed to create working window/tab');
}
```

## Navigate

```ts
await chrome.call('tabs.update', tabId, { url: 'https://example.com', active: true });
await waitForTabLoad(chrome, tabId);
```

## Focus Stabilization

```ts
await chrome.call('windows.update', windowId, { focused: true });
await chrome.call('tabs.update', tabId, { active: true });
await chrome.call('debugger.sendCommand', { tabId, method: 'Page.bringToFront' });
```

## Attach And Detach Debugger

```ts
await chrome.call('debugger.attach', { tabId });
await chrome.call('debugger.sendCommand', { tabId, method: 'Page.enable' });
await chrome.call('debugger.sendCommand', { tabId, method: 'Runtime.enable' });

// ... work ...

await chrome.call('debugger.detach', { tabId });
```

## Runtime Evaluate Via CDP

```ts
async function runtimeEvaluate(
  chrome: { call: (method: string, ...args: unknown[]) => Promise<unknown> },
  tabId: number,
  expression: string
): Promise<unknown> {
  const response = (await chrome.call('debugger.sendCommand', {
    tabId,
    method: 'Runtime.evaluate',
    params: {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    },
  })) as {
    result?: { value?: unknown };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };

  if (response?.exceptionDetails) {
    const detail =
      response.exceptionDetails.exception?.description ||
      response.exceptionDetails.text ||
      'Runtime.evaluate failed';
    throw new Error(detail);
  }

  return response?.result?.value;
}
```

## `debugger.evaluate` Shortcut

```ts
const result = await chrome.call('debugger.evaluate', {
  tabId,
  code: '({ title: document.title, url: location.href })',
  awaitPromise: true,
  userGesture: true,
});
```

## Network Capture

```ts
await chrome.call('debugger.attach', { tabId });
await chrome.call('debugger.sendCommand', { tabId, method: 'Network.enable' });
await chrome.call('debugger.sendCommand', { tabId, method: 'Page.enable' });

await chrome.call('tabs.update', tabId, { url: 'https://example.com', active: true });
await waitForTabLoad(chrome, tabId);

const events = await chrome.call('debugger.getEvents', {
  tabId,
  filter: 'Network.',
  clear: false,
});

await chrome.call('debugger.getEvents', { tabId, clear: true });
await chrome.call('debugger.detach', { tabId });
```

## Screenshot Via CDP

```ts
await chrome.call('debugger.attach', { tabId });
await chrome.call('debugger.sendCommand', { tabId, method: 'Page.enable' });

const shot = (await chrome.call('debugger.sendCommand', {
  tabId,
  method: 'Page.captureScreenshot',
  params: { format: 'png' },
})) as { data?: string };

const pngBase64 = shot.data;
await chrome.call('debugger.detach', { tabId });
```

## Downloads

```ts
const downloadId = (await chrome.call('downloads.download', {
  url: 'https://example.com/',
  filename: 'downloads/example.html',
  saveAs: false,
})) as number;

let completed = false;
for (let i = 0; i < 300; i += 1) {
  const items = (await chrome.call('downloads.search', {
    id: downloadId,
    limit: 1,
  })) as Array<{ state?: string }>;

  const item = items[0];
  if (item?.state === 'complete' || item?.state === 'interrupted') {
    completed = true;
    break;
  }
  await sleep(200);
}

if (!completed) {
  throw new Error('download timeout');
}
```

## Cookies

```ts
await chrome.call('cookies.getAll', { domain: 'example.com' });
await chrome.call('cookies.get', { url: 'https://example.com', name: 'session' });
await chrome.call('cookies.set', {
  url: 'https://example.com',
  name: 'my_cookie',
  value: 'abc123',
});
await chrome.call('cookies.remove', { url: 'https://example.com', name: 'my_cookie' });
```

## Storage

```ts
await chrome.call('storage.local.set', { myKey: 'myValue' });
await chrome.call('storage.local.get', 'myKey');
await chrome.call('storage.local.remove', 'myKey');
```

## Event Subscription

```ts
const events: unknown[] = [];
const unsubscribe = chrome.subscribe('tabs.onUpdated', (data) => {
  events.push(data);
});

// ... work ...

unsubscribe();
```

## Retry Wrapper

```ts
async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      console.error(`[retry] ${label} attempt=${attempt + 1} failed; retrying`);
      await sleep(300);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
```

## Deterministic JSON Writer

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8');
}
```

## Cleanup Pattern

```ts
let attached = false;

try {
  await chrome.call('debugger.attach', { tabId });
  attached = true;

  // ... work ...
} finally {
  if (attached) {
    try {
      await chrome.call('debugger.detach', { tabId });
    } catch {}
  }

  try {
    await chrome.call('windows.remove', windowId);
  } catch {}
}
```
