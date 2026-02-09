# @ank1015/llm-extension

Chrome extension (Manifest V3) + native messaging host that provides a general-purpose RPC bridge to Chrome APIs. External agents connect via TCP and call any Chrome API using the same `call()` / `subscribe()` interface.

## Commands

```bash
pnpm build            # Build native host (tsc) + Chrome extension (esbuild)
pnpm build:native     # Build native host only
pnpm build:chrome     # Bundle Chrome extension only
pnpm dev              # Watch mode for both
pnpm test             # Run unit tests (25 tests, no Chrome needed)
pnpm test:e2e         # Run E2E tests against live Chrome (requires extension installed)
pnpm typecheck        # Type-check both tsconfigs
pnpm clean            # Remove dist/
```

## Architecture

```
External Agent ── TCP :9224 ──→ Native Host ── stdin/stdout ──→ Chrome Extension
                                    │                               │
                               ChromeServer                    background.ts
                               ChromeClient                   (RPC proxy)
```

- **Chrome extension** (`background.ts`): thin RPC proxy that receives `call`/`subscribe`/`unsubscribe` messages, executes the corresponding Chrome API, sends back `result`/`error`/`event`.
- **Native host** (`host.ts`): Chrome launches this process. Runs a `ChromeClient` (stdin/stdout to Chrome) and a `ChromeServer` (TCP on port 9224 for external agents).
- **SDK** (`connect()`): external agents import this to connect via TCP. Returns a `ChromeClient` with `call()` and `subscribe()`.

## Structure

```
src/
  index.ts                  # Public exports
  protocol/
    types.ts                # 6 message types: call, subscribe, unsubscribe, result, error, event
    constants.ts            # NATIVE_HOST_NAME, MAX_MESSAGE_SIZE, LENGTH_PREFIX_BYTES, DEFAULT_PORT
  sdk/
    client.ts               # ChromeClient — call(), subscribe(), run() read loop
    connect.ts              # connect() — TCP client, returns ChromeClient
    index.ts                # SDK barrel exports + createChromeClient()
  native/
    host.ts                 # Entry point — creates ChromeClient + ChromeServer
    server.ts               # ChromeServer — TCP server proxying through ChromeClient
    stdio.ts                # Read/write length-prefixed JSON (used by both native messaging and TCP)
    host-wrapper.sh         # Shell wrapper Chrome executes
  chrome/
    background.ts           # Service worker — RPC proxy (resolveMethod, handleCall, handleSubscribe)
    manifest.json           # Manifest V3
tests/
  unit/sdk/
    client.test.ts          # ChromeClient call/subscribe/error/interleaved tests
    create-chrome-client.test.ts  # Factory function tests
  unit/native/
    stdio.test.ts           # Length-prefix encode/decode tests
    server.test.ts          # ChromeServer TCP proxying tests
  e2e/
    chrome-rpc.e2e.ts       # E2E tests against live Chrome (tabs, scripting, storage, subscribe)
manifests/
  com.ank1015.llm.json      # Native host manifest template
  install-host.sh           # Install manifest + wrapper to Chrome NativeMessagingHosts
```

## Two TypeScript Configs

- `tsconfig.json` — Native host + SDK (NodeNext, emits to `dist/`)
- `tsconfig.chrome.json` — Chrome extension (bundler resolution, noEmit, type-check only)

## Setup

1. `pnpm build`
2. Load `dist/chrome/` as unpacked extension in `chrome://extensions`
3. Copy the extension ID
4. `./manifests/install-host.sh <extension-id>`
5. **Quit and reopen Chrome** (manifest changes require full restart)

The install script copies a wrapper to `~/.local/share/llm-native-host/` because Chrome's sandbox on macOS blocks executing scripts from Desktop.

## Usage from Other Packages

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect(); // TCP to localhost:9224
const tabs = await chrome.call('tabs.query', { active: true });
const result = await chrome.call('scripting.executeScript', {
  target: { tabId: tabs[0].id },
  code: 'document.title',
});
```

## Conventions

- Protocol uses 6 message types in discriminated unions keyed on `type`
- Every message carries an `id` (UUID) for request/response correlation
- `call` → single `result` or `error` (1:1)
- `subscribe` → stream of `event` messages until `unsubscribe` (1:N)
- `scripting.executeScript` accepts a `code` string (special-cased in background.ts, runs via eval in MAIN world)
- stdio functions accept injected streams for testability (used by both native messaging and TCP)
- Default TCP port: 9224 (configurable via `CHROME_RPC_PORT` env var)
