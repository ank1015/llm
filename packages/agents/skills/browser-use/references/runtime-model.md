# Runtime Model

Use `@ank1015/llm-extension` as the browser control layer.

## Import And Connect

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
```

Use `launch: true` for automation scripts so Chrome is opened if needed.

## Mental Model

Your script talks to Chrome through a local RPC bridge:

```text
TypeScript script -> TCP localhost:9224 -> native host -> Chrome extension -> chrome.* API
```

Most operations use:

```ts
await chrome.call('<method>', ...args);
```

Examples:

```ts
await chrome.call('tabs.query', { active: true, currentWindow: true });
await chrome.call('tabs.update', tabId, { url: 'https://example.com' });
await chrome.call('windows.create', { url: 'about:blank' });
await chrome.call('downloads.search', { limit: 5 });
await chrome.call('cookies.getAll', { domain: 'example.com' });
```

## Main Method Families

- Tabs: `tabs.query`, `tabs.get`, `tabs.create`, `tabs.update`, `tabs.remove`, `tabs.reload`
- Windows: `windows.getAll`, `windows.get`, `windows.create`, `windows.update`, `windows.remove`
- Downloads: `downloads.download`, `downloads.search`, `downloads.removeFile`, `downloads.erase`
- Cookies: `cookies.getAll`, `cookies.get`, `cookies.set`, `cookies.remove`
- Storage: `storage.local.get`, `storage.local.set`, `storage.local.remove`
- Events: `chrome.subscribe('<event>', callback)` and the returned unsubscribe function

## Debugger Methods

These are first-class methods implemented by the extension:

- `debugger.evaluate`
- `debugger.attach`
- `debugger.sendCommand`
- `debugger.getEvents`
- `debugger.detach`

### One-Shot Evaluate

Use `debugger.evaluate` for a single browser-context read or calculation:

```ts
const result = await chrome.call('debugger.evaluate', {
  tabId,
  code: '({ title: document.title, url: location.href })',
  awaitPromise: true,
  userGesture: true,
});
```

This is the fastest choice when you do not need an open CDP session.

### Long-Lived Debugger Session

Use `debugger.attach` + `debugger.sendCommand` when you need:

- multiple CDP calls on the same tab
- focus-sensitive browser behavior
- network capture
- screenshots via CDP
- page lifecycle domains like `Page`, `Runtime`, or `Network`

Typical shape:

```ts
await chrome.call('debugger.attach', { tabId });
await chrome.call('debugger.sendCommand', { tabId, method: 'Page.enable' });
await chrome.call('debugger.sendCommand', { tabId, method: 'Runtime.enable' });
// ... more commands ...
await chrome.call('debugger.detach', { tabId });
```

## When To Use Which Path

- Use normal `chrome.call('tabs.*' | 'windows.*' | 'downloads.*' ...)` for standard browser APIs.
- Use `debugger.evaluate` for a one-off page-state read or DOM-side computation.
- Use a long-lived debugger session when the task needs several CDP calls or event capture.
