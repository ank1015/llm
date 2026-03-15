# @ank1015/llm-extension

Chrome RPC bridge for automating or inspecting a live Chrome session from Node.js.

This package combines:

- a Manifest V3 Chrome extension that exposes Chrome APIs over RPC
- a native messaging host that bridges Chrome to TCP
- a Node client with `connect()`, `call()`, `subscribe()`, and `getPageMarkdown()`

It is intentionally a low-level Chrome RPC package. It does not ship a higher-level browser automation wrapper.

## What You Get

- `connect(opts?)` to attach to the local Chrome bridge
- `ChromeClient.call(method, ...args)` for generic Chrome API access
- `ChromeClient.subscribe(event, callback)` for Chrome events
- `ChromeClient.getPageMarkdown(tabId, opts?)` as an optional HTML-to-markdown helper
- `ChromeServer` plus protocol/stdio helpers if you need lower-level integration

## Architecture

```text
Node process ── TCP :9224 ──→ native host ── native messaging ──→ Chrome extension
```

1. The Chrome extension runs a background service worker.
2. Chrome launches the native host through native messaging.
3. The native host opens a local TCP server.
4. Your Node process connects and sends length-prefixed JSON RPC messages.

Docs:

- [docs/README.md](docs/README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/testing.md](docs/testing.md)

## Install and Setup

```bash
pnpm add @ank1015/llm-extension
```

Build the package:

```bash
pnpm --filter @ank1015/llm-extension build
```

Load the unpacked extension from `packages/extension/dist/chrome/` in `chrome://extensions`, then register the native host.

For macOS, use the packaged installer script:

```bash
./packages/extension/manifests/install-host.sh <extension-id>
```

The script is macOS-specific. For other environments, use `manifests/com.ank1015.llm.json` as the template for manual native-host registration.

## Usage

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });

const tabs = (await chrome.call('tabs.query', {
  active: true,
  currentWindow: true,
})) as { id?: number; url?: string }[];

const tabId = tabs[0]?.id;
if (typeof tabId !== 'number') {
  throw new Error('No active tab found');
}

const title = await chrome.call('debugger.evaluate', {
  tabId,
  code: 'document.title',
});

const markdown = await chrome.getPageMarkdown(tabId);
```

## Core API

### `connect(opts?)`

Opens a TCP connection to the local Chrome RPC bridge and returns a ready-to-use `ChromeClient`.

Options:

- `host`: TCP host, default `127.0.0.1`
- `port`: TCP port, default `9224`
- `launch`: auto-open Chrome on connection failure
- `launchTimeout`: max time to wait for Chrome/native host startup

### `chrome.call(method, ...args)`

Calls Chrome APIs by dot-path. Examples:

- `tabs.query`
- `tabs.get`
- `windows.create`
- `cookies.getAll`
- `storage.local.get`

Special RPC helpers also exist:

- `debugger.evaluate`
- `debugger.attach`
- `debugger.sendCommand`
- `debugger.getEvents`
- `debugger.detach`

### `chrome.subscribe(event, callback)`

Subscribes to Chrome events such as `tabs.onUpdated`.

### `chrome.getPageMarkdown(tabId, opts?)`

Reads full page HTML via `debugger.evaluate`, sends it to a local converter service, and returns markdown.

This helper is optional and non-core:

- it requires a converter service, default `http://localhost:8080/convert`
- it throws on converter failures instead of returning a fallback string

## Commands

```bash
pnpm --filter @ank1015/llm-extension build
pnpm --filter @ank1015/llm-extension lint
pnpm --filter @ank1015/llm-extension typecheck
pnpm --filter @ank1015/llm-extension test:unit
pnpm --filter @ank1015/llm-extension test:e2e
pnpm --filter @ank1015/llm-extension test:e2e:page-markdown
```
