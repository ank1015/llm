# State And Debugging

Use this file when DOM-level work is not enough.

This is the low-level mode for browser state inspection, downloads, cookies,
storage, and CDP-backed debugging. Use it when the real task is about session
state, network behavior, or browser-managed artifacts rather than page clicks.

## Import Style

Import the low-level client from the SDK:

```ts
import { connect } from '@ank1015/llm-extension';
```

## When To Use This File

Use this file when the task is mainly about:

- cookies or authenticated session state
- Chrome storage or page storage
- downloads and download cleanup
- network capture and request or response inspection
- long-lived debugger sessions

Use a different file when:

- the task is mainly read-only page understanding:
  [research-and-reading.md](research-and-reading.md)
- the task is mainly clicks, typing, selects, or other UI actions:
  [webapp-flows.md](webapp-flows.md)
- the same workflow must run repeatedly at scale:
  [batch-automation.md](batch-automation.md)

## Default Primitives

Stay low-level here:

- `connect({ launch: true })`
- `chrome.call(...)`
- `debugger.evaluate`
- `debugger.attach`
- `debugger.sendCommand`
- `debugger.getEvents`
- `debugger.detach`

Optional note:

- `chrome.subscribe(...)` can help with event-driven waiting, but it is not the
  default pattern in this file

Do not mix `Window` into the main workflows here.

## Cookies

Use direct cookie APIs when the task is about login state or cookie mutation.

Main methods:

- `cookies.getAll`
- `cookies.get`
- `cookies.set`
- `cookies.remove`
- `cookies.getAllCookieStores`

Use this path for:

- checking whether a session cookie exists
- reading domain-scoped cookies
- creating short-lived test cookies
- removing cookies you created during the task

If you create a test cookie, remove it before finishing.

## Chrome Storage Vs Page Storage

Do not confuse these two storage layers.

### Chrome storage

Use `storage.local.*` through `chrome.call(...)`.

This is browser or extension-side storage exposed directly by the Chrome API.

Good for:

- storing task state from the extension side
- reading values already kept in `storage.local`

### Page storage

Use `debugger.evaluate` for page `localStorage` and `sessionStorage`.

These are page-context storage APIs, not `chrome.storage`.

Good for:

- inspecting app-side persisted values
- checking whether a page cached tokens, flags, or user preferences

Treat page storage as page state, not as a Chrome API.

## Downloads

Use the low-level downloads APIs for download state and cleanup.

Main methods:

- `downloads.download`
- `downloads.search`
- `downloads.removeFile`
- `downloads.erase`

Default flow:

1. start the download with `downloads.download`
2. poll with `downloads.search` until the item reaches a terminal state
3. inspect the resolved filename and final state
4. remove files or metadata if the task created test artifacts

Polling is the default pattern here. If needed, `chrome.subscribe(...)` can be
used as an optional waiting aid for browser events, but keep the main workflow
simple and call-first.

## Network Capture

Use one practical CDP flow only:

1. `debugger.attach`
2. `debugger.sendCommand(... Network.enable ...)`
3. trigger navigation or the relevant action
4. `debugger.getEvents` with `filter: 'Network.'`
5. optionally call `Network.getResponseBody` for a specific `requestId`
6. `debugger.detach`

Useful details:

- use `filter: 'Network.'` to keep event retrieval focused
- use `clear: true` when you want to reset the collected events between phases
- capture events first, then fetch the response body for the request you care
  about

This file should not become a general CDP cookbook. Keep the network guidance
to this capture pattern.

## Debugger Sessions

Use `debugger.evaluate` for one-shot page inspection.

Use long-lived debugger sessions when you need persistent CDP domains such as
`Network`.

Important rules:

- always detach when you opened a session
- a repeated attach call can return an already-attached result; treat that as
  an existing session, not a fresh failure
- use `debugger.evaluate` for small page-state inspection, not as a substitute
  for every other browser API

## Cleanup Rules

- always `debugger.detach` when you opened a session
- clear collected events when reusing a session for multiple phases
- remove test cookies you created
- remove download files or metadata when the task created them only for testing
- unsubscribe if you used `chrome.subscribe(...)`

## Default Vs Avoid

### Default to

- direct cookies, storage, and downloads APIs when they already exist
- `debugger.evaluate` for small page-state inspection
- long-lived debugger sessions for network capture

### Avoid by default

- using `debugger.evaluate` as a substitute for every state API
- mixing `Window` into the main workflows in this file
- expanding this document into a broad CDP reference

## Examples

### 1) Cookie round trip

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
await chrome.call('cookies.set', {
  url: 'https://example.com',
  name: 'skill_test',
  value: '1',
  path: '/',
});
const cookie = await chrome.call('cookies.get', {
  url: 'https://example.com',
  name: 'skill_test',
});
await chrome.call('cookies.remove', {
  url: 'https://example.com',
  name: 'skill_test',
});
```

### 2) Inspect page storage

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
const evaluation = (await chrome.call('debugger.evaluate', {
  tabId,
  code: 'localStorage.getItem(\"token\")',
})) as { result?: unknown; type?: string };
const value = evaluation.result;
```

Use this for page `localStorage` or `sessionStorage`, not for `storage.local`.

### 3) Download and cleanup

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
const queryTerm = `skill-download-${Date.now()}`;
const filename = `tmp/${queryTerm}.csv`;
const downloadId = await chrome.call('downloads.download', {
  url: 'https://example.com/file.csv',
  filename,
  saveAs: false,
});
const items = await chrome.call('downloads.search', {
  query: [queryTerm],
  limit: 10,
});
await chrome.call('downloads.removeFile', downloadId);
await chrome.call('downloads.erase', { query: [queryTerm], limit: 10 });
```

### 4) Network capture with response body

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
await chrome.call('debugger.attach', { tabId });
try {
  await chrome.call('debugger.sendCommand', {
    tabId,
    method: 'Network.enable',
  });
  await chrome.call('tabs.update', tabId, { url: 'https://example.com' });
  const events = (await chrome.call('debugger.getEvents', {
    tabId,
    filter: 'Network.',
  })) as { method?: string; params?: { requestId?: string } }[];

  const responseEvent = events.find(
    (event) => event.method === 'Network.responseReceived' && event.params?.requestId
  );

  if (responseEvent?.params?.requestId) {
    await chrome.call('debugger.sendCommand', {
      tabId,
      method: 'Network.getResponseBody',
      params: { requestId: responseEvent.params.requestId },
    });
  }
} finally {
  await chrome.call('debugger.detach', { tabId });
}
```

## Not Covered Here

Use other references when the task stops being state/debugging work:

- [webapp-flows.md](webapp-flows.md) for UI-level interaction
- [pitfalls.md](pitfalls.md) for debugger, session, and focus gotchas
- [batch-automation.md](batch-automation.md) when these workflows need to
  scale
