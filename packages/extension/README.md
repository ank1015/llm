# @ank1015/llm-extension

A Chrome extension that exposes Chrome APIs over a general-purpose RPC bridge. Any process on your machine can connect via TCP and call Chrome APIs like `tabs.query`, `scripting.executeScript`, `storage.local.get`, or subscribe to events like `tabs.onUpdated` — all through a simple `call()` / `subscribe()` interface.

## How It Works

```
Your Agent ── TCP :9224 ──→ Native Host ── stdin/stdout ──→ Chrome Extension
                                │                               │
                           ChromeServer                    background.ts
                           (TCP proxy)                    (RPC proxy)
```

1. **Chrome extension** installs as a Manifest V3 service worker. On startup, it connects to a native messaging host.
2. **Native host** is a Node.js process Chrome launches via the [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) protocol. It opens a TCP server on port 9224.
3. **Your agent** connects to the TCP server and sends RPC messages. The native host forwards them to Chrome over stdin/stdout. Chrome executes the API call and sends the result back through the same chain.

The protocol uses 6 message types: `call`, `subscribe`, `unsubscribe` (agent → Chrome) and `result`, `error`, `event` (Chrome → agent). All messages are length-prefixed JSON, correlated by UUID.

## Setup

### Prerequisites

- Chrome browser
- Node.js 18+
- pnpm

### Install

```bash
# Build the extension and native host
pnpm build

# Load the extension in Chrome:
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select packages/extension/dist/chrome/
# 4. Copy the extension ID shown on the card

# Register the native messaging host
./manifests/install-host.sh <extension-id>

# Quit and reopen Chrome (required for native host registration)
```

After this one-time setup, Chrome will automatically launch the native host whenever the extension loads.

### Verify

Check the extension's service worker console (`chrome://extensions` → Inspect views → service worker):

```
[bg] background service worker loaded
```

No disconnect error means the native host is running and the TCP server is ready on port 9224.

## Usage

### From TypeScript/JavaScript

```ts
import { connect } from '@ank1015/llm-extension';

// Auto-launch Chrome if not running, retry until native host is ready
const chrome = await connect({ launch: true });

// Query tabs
const tabs = await chrome.call('tabs.query', { active: true, currentWindow: true });
console.log(tabs);

// Execute JavaScript in a tab
const result = await chrome.call('scripting.executeScript', {
  target: { tabId: tabs[0].id },
  code: 'document.title',
});
console.log(result[0].result); // page title

// Use storage
await chrome.call('storage.local.set', { myKey: 'myValue' });
const data = await chrome.call('storage.local.get', 'myKey');
console.log(data.myKey); // 'myValue'

// Read a tab as markdown via the local HTML converter service
const markdown = await chrome.getPageMarkdown(tabs[0].id);
console.log(markdown);

// Subscribe to events
const unsubscribe = chrome.subscribe('tabs.onUpdated', (args) => {
  const [tabId, changeInfo, tab] = args;
  console.log(`Tab ${tabId} updated:`, changeInfo);
});

// Later...
unsubscribe();
```

### From Any Language

The protocol is language-agnostic. Connect to TCP port 9224 and exchange length-prefixed JSON:

```
[4 bytes: uint32 LE message length][JSON payload]
```

Send a call:

```json
{ "id": "uuid-here", "type": "call", "method": "tabs.query", "args": [{ "active": true }] }
```

Receive the result:

```json
{ "id": "uuid-here", "type": "result", "data": [{ "id": 1, "url": "https://..." }] }
```

## API

### `connect(opts?)`

Connect to the Chrome RPC server. Returns a `ChromeClient`.

| Option          | Default       | Description                                         |
| --------------- | ------------- | --------------------------------------------------- |
| `port`          | `9224`        | TCP port to connect to                              |
| `host`          | `'127.0.0.1'` | TCP host to connect to                              |
| `launch`        | `false`       | Launch Chrome automatically if connection fails     |
| `launchTimeout` | `30000`       | Max ms to wait for Chrome + native host to be ready |

```ts
const chrome = await connect();
const chrome = await connect({ port: 9224, host: '127.0.0.1' });
const chrome = await connect({ launch: true }); // auto-open Chrome if not running
const chrome = await connect({ launch: true, launchTimeout: 15000 });
```

### `ChromeClient.call(method, ...args)`

Call any Chrome API method. The method string maps to `chrome.<method>` in the extension.

```ts
// chrome.tabs.query({ active: true })
await chrome.call('tabs.query', { active: true });

// chrome.tabs.get(123)
await chrome.call('tabs.get', 123);

// chrome.storage.local.get('key')
await chrome.call('storage.local.get', 'key');
```

### `ChromeClient.call('scripting.executeScript', opts)`

Special case: pass a `code` string instead of a function reference. The code runs in the page's main world via `eval`.

```ts
await chrome.call('scripting.executeScript', {
  target: { tabId: 123 },
  code: 'document.title',
});

await chrome.call('scripting.executeScript', {
  target: { tabId: 123 },
  code: '({ title: document.title, url: location.href })',
});
```

### `ChromeClient.subscribe(event, callback)`

Subscribe to a Chrome event. Returns an unsubscribe function.

```ts
const unsub = chrome.subscribe('tabs.onUpdated', (args) => {
  console.log('Tab updated:', args);
});

// Stop listening
unsub();
```

### `ChromeClient.getPageMarkdown(tabId, opts?)`

Read a tab's full HTML via `debugger.evaluate` and convert it to markdown
using the local converter service.

| Option         | Default                           | Description                                  |
| -------------- | --------------------------------- | -------------------------------------------- |
| `timeoutMs`    | `30000`                           | Max ms to wait for the tab to finish loading |
| `converterUrl` | `'http://localhost:8080/convert'` | HTML-to-markdown service endpoint            |

```ts
const markdown = await chrome.getPageMarkdown(tabId);
const markdown = await chrome.getPageMarkdown(tabId, {
  converterUrl: 'http://localhost:8080/convert',
  timeoutMs: 15000,
});
```

## Configuration

| Variable          | Default | Description                         |
| ----------------- | ------- | ----------------------------------- |
| `CHROME_RPC_PORT` | `9224`  | TCP port the native host listens on |

Set in the wrapper script at `~/.local/share/llm-native-host/run-host.sh` or pass via `connect({ port })`.

## Development

```bash
pnpm dev              # Watch mode (native + chrome)
pnpm test             # Unit tests (25 tests)
pnpm test:e2e         # E2E tests against live Chrome
pnpm typecheck        # Type-check both tsconfigs
```

### Project Structure

```
src/
  protocol/           # Shared message types and constants
  sdk/                # ChromeClient, connect(), createChromeClient()
  native/             # Node.js native host (host.ts, server.ts, stdio.ts)
  chrome/             # Chrome extension (background.ts, manifest.json)
tests/
  unit/               # Unit tests (stdio, client, server, factory)
  e2e/                # E2E tests against live Chrome
manifests/            # Native host manifest and install script
```

### Two Build Targets

The package has two runtime contexts with separate TypeScript configs:

- **Node** (`tsconfig.json`): native host + SDK, compiled by `tsc` to `dist/`
- **Chrome** (`tsconfig.chrome.json`): extension service worker, bundled by `esbuild` to `dist/chrome/`
