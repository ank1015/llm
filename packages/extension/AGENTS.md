# @ank1015/llm-extension

Chrome extension (Manifest V3) + native messaging host that provides a general-purpose RPC bridge to Chrome APIs. External agents connect via TCP and call any Chrome API using the same `call()` / `subscribe()` interface.

## Commands

```bash
pnpm build            # Build native host (tsc) + Chrome extension (esbuild)
pnpm build:native     # Build native host only
pnpm build:chrome     # Bundle Chrome extension only
pnpm dev              # Watch mode for both
pnpm test             # Run unit tests (25+ tests, no Chrome needed)
pnpm test:e2e         # Core E2E: tabs, scripting, storage, subscribe
pnpm test:e2e:accessibility  # Accessibility features + tabs lifecycle
pnpm test:e2e:cookies        # Cookies API: get/set/remove
pnpm test:e2e:debugger       # Debugger API: CSP bypass, error handling
pnpm test:e2e:network        # CDP Network domain: capture requests
pnpm test:e2e:windows        # Windows API: create/update/remove
pnpm typecheck        # Type-check both tsconfigs
pnpm clean            # Remove dist/
```

All E2E tests require: `pnpm build`, extension loaded in Chrome, native host installed.

## Architecture

```
External Agent ── TCP :9224 ──→ Native Host ── stdin/stdout ──→ Chrome Extension
                                    │                               │
                               ChromeServer                    background.ts
                               ChromeClient                   (RPC proxy)
```

- **Chrome extension** (`background.ts`): RPC proxy that routes `call`/`subscribe`/`unsubscribe` messages to Chrome APIs. Includes special handlers for `debugger.*` and `scripting.executeScript` with code strings.
- **Native host** (`host.ts`): Chrome-launched process. Runs a `ChromeClient` (stdin/stdout to Chrome) and a `ChromeServer` (TCP on port 9224).
- **SDK** (`connect()`): external agents import this to connect via TCP. Returns a `ChromeClient` with `call()` and `subscribe()`. Supports `launch: true` to auto-open Chrome if not running.

## Structure

```
src/
  index.ts                  # Public exports
  protocol/
    types.ts                # 6 message types: call, subscribe, unsubscribe, result, error, event
    constants.ts            # NATIVE_HOST_NAME, MAX_MESSAGE_SIZE, LENGTH_PREFIX_BYTES, DEFAULT_PORT
  sdk/
    client.ts               # ChromeClient — call(), subscribe(), run() read loop
    connect.ts              # connect() — TCP client, auto-launch Chrome, returns ChromeClient
    index.ts                # SDK barrel exports + createChromeClient()
  native/
    host.ts                 # Entry point — creates ChromeClient + ChromeServer, exits on disconnect
    server.ts               # ChromeServer — TCP server proxying through ChromeClient
    stdio.ts                # Read/write length-prefixed JSON (native messaging + TCP)
    host-wrapper.sh         # Shell wrapper Chrome executes
  chrome/
    background.ts           # Service worker — RPC proxy + debugger session management + auto-reconnect
    manifest.json           # Manifest V3
tests/
  unit/sdk/
    client.test.ts          # ChromeClient call/subscribe/error/interleaved tests
    create-chrome-client.test.ts  # Factory function tests
  unit/native/
    stdio.test.ts           # Length-prefix encode/decode tests
    server.test.ts          # ChromeServer TCP proxying tests
  e2e/
    chrome-rpc.e2e.ts       # Core: tabs, scripting, storage, subscribe
    accessibility.e2e.ts    # accessibilityFeatures API + tabs lifecycle on Anthropic page
    cookies.e2e.ts          # cookies API: getAll, get, set, remove, getAllCookieStores
    debugger.e2e.ts         # debugger.evaluate: CSP bypass, types, errors, detach resilience
    network.e2e.ts          # CDP Network domain via debugger session: capture, filter, getResponseBody
    windows.e2e.ts          # windows API: create, get, getAll, update, remove
manifests/
  com.ank1015.llm.json      # Native host manifest template
  install-host.sh           # Install manifest + wrapper to Chrome NativeMessagingHosts
```

## Permissions

Manifest V3 permissions (in `manifest.json`):

| Permission                     | Used by                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `nativeMessaging`              | Native host communication                                        |
| `scripting`                    | `scripting.executeScript` with code strings                      |
| `activeTab`, `tabs`            | Tab queries, create, update, remove                              |
| `storage`                      | `storage.local` get/set/remove                                   |
| `cookies`                      | `cookies.getAll`, `cookies.get`, `cookies.set`, `cookies.remove` |
| `debugger`                     | `debugger.evaluate`, debugger sessions (Network, etc.)           |
| `accessibilityFeatures.read`   | Read accessibility settings                                      |
| `accessibilityFeatures.modify` | Modify accessibility settings                                    |
| `<all_urls>` (host)            | Script injection + cookies on any domain                         |

## Special RPC Methods

These methods are special-cased in `background.ts` (not resolved via generic `resolveMethod`):

| Method                                  | Description                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `debugger.evaluate`                     | One-shot: attach → `Runtime.evaluate` → detach. Bypasses page CSP.           |
| `debugger.attach`                       | Open a long-lived debugger session on a tab                                  |
| `debugger.sendCommand`                  | Send any CDP command to an attached tab                                      |
| `debugger.detach`                       | Close debugger session, clean up events                                      |
| `debugger.getEvents`                    | Return collected CDP events (optionally filtered/cleared)                    |
| `scripting.executeScript` (with `code`) | Wraps code string in `eval()` via `func`. Works on pages without strict CSP. |

All other methods (e.g., `tabs.query`, `cookies.getAll`, `windows.create`) are resolved generically via dot-path traversal on the `chrome` object.

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

// Auto-launch Chrome if not running, retry until native host is ready
const chrome = await connect({ launch: true });

// Or connect without auto-launch (throws ECONNREFUSED if Chrome is not running)
// const chrome = await connect();

// Generic Chrome API calls
const tabs = await chrome.call('tabs.query', { active: true });
const cookies = await chrome.call('cookies.getAll', { domain: 'example.com' });
const win = await chrome.call('windows.create', { url: 'https://example.com' });

// CSP-bypassing JS execution (uses chrome.debugger internally)
const result = await chrome.call('debugger.evaluate', {
  tabId: tabs[0].id,
  code: 'document.title',
});

// Long-lived debugger session (e.g., Network capture)
await chrome.call('debugger.attach', { tabId });
await chrome.call('debugger.sendCommand', { tabId, method: 'Network.enable' });
// ... navigate, wait for requests ...
const events = await chrome.call('debugger.getEvents', { tabId, filter: 'Network.' });
await chrome.call('debugger.detach', { tabId });

// Event subscriptions
const unsub = chrome.subscribe('tabs.onUpdated', (data) => console.log(data));
unsub(); // stop listening
```

## Conventions

- Protocol uses 6 message types in discriminated unions keyed on `type`
- Every message carries an `id` (UUID) for request/response correlation
- `call` → single `result` or `error` (1:1)
- `subscribe` → stream of `event` messages until `unsubscribe` (1:N)
- `scripting.executeScript` with `code` string uses `eval()` in MAIN world — fails on pages with strict CSP (use `debugger.evaluate` instead)
- `debugger.evaluate` does one-shot attach/detach — use `debugger.attach` + `debugger.sendCommand` for long-lived sessions
- Most `accessibilityFeatures.*` are ChromeOS-only; only `animationPolicy` works cross-platform
- stdio functions accept injected streams for testability
- Default TCP port: 9224 (configurable via `CHROME_RPC_PORT` env var)
- Native host exits cleanly when Chrome disconnects (no zombie processes)
- Service worker registers `onStartup` listener and auto-reconnects native host if port is lost
- `connect({ launch: true })` auto-opens Chrome and retries with exponential backoff (macOS + Linux)

## Known Limitations

- `scripting.executeScript` with `code` strings fails on strict-CSP pages (anthropic.com, github.com, etc.) — use `debugger.evaluate` instead
- `debugger.evaluate` and debugger sessions show a yellow "debugging" banner in the tab
- `accessibilityFeatures` other than `animationPolicy` are ChromeOS-only
- Adding/removing manifest permissions requires reloading the extension and possibly re-enabling it in Chrome
- Native host manifest changes require a full Chrome restart (Cmd+Q)
- Auto-launch (`launch: true`) supports macOS and Linux only
