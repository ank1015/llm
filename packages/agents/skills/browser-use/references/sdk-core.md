# SDK Core

This is the first reference to read after `SKILL.md`.

It is the shortest possible guide to the browser SDK primitives an agent should trust first.

## Import Style

Import from `@ank1015/llm-extension`.

```ts
import { connect } from '@ank1015/llm-extension';
```

Do not import from `@ank1015/llm-extension/src/...` or `@ank1015/llm-extension/dist/...`.

## Mental Model

- `connect(...)` opens a client connection to the local Chrome bridge.
- That client is a `ChromeClient`.
- `connect(...)` already starts the client read loop. Do not call `chrome.run()` manually after `connect()`.
- `chrome.call(method, ...args)` is the generic primitive. It maps method strings like `tabs.query` to `chrome.tabs.query(...)` inside the extension.
- Some methods are special RPC helpers rather than direct Chrome API methods:
  - `debugger.evaluate`
  - `debugger.attach`
  - `debugger.sendCommand`
  - `debugger.getEvents`
  - `debugger.detach`
- `chrome.getPageMarkdown(...)` is an optional read-only helper built on top of the low-level client.

## Start Here

Use these defaults unless you have a clear reason not to:

| If the task is... | Start with... | Why |
| --- | --- | --- |
| almost any browser task | `connect({ launch: true })` | it is the normal entry point and can auto-open Chrome if needed |
| a generic browser operation | `chrome.call(...)` | it is the main primitive and covers most Chrome APIs |
| read-only page extraction | `chrome.getPageMarkdown(tabId)` | it is simpler than custom DOM extraction when the converter service is available |
| execute page JavaScript | `debugger.evaluate` | it is more reliable than `scripting.executeScript` on strict-CSP pages |
| long-lived CDP work | `debugger.attach` + `debugger.sendCommand` | it keeps a debugger session open for network, Page, DOM, and Runtime work |
| event-driven waiting | `chrome.subscribe(...)` | it is useful for long-running or event-driven tasks |
| interactive webapp flows | raw RPC plus `debugger.evaluate` | it keeps the workflow explicit now that the package is RPC-only |

## Blessed Defaults

### `connect({ launch: true })`

Use this as the normal starting point.

- `launch: true` is the skill-level default for automation and agent work.
- `port` and `host` are available, but most tasks should not need custom values.
- `launchTimeout` is only worth changing when startup timing is part of the task.
- when you write a standalone Node script with `connect(...)`, explicitly `process.exit(0)` or `process.exit(1)` after cleanup because the Chrome connection can keep the process alive

### `chrome.call(method, ...args)`

Use it for exact Chrome API work:

- `tabs.*`
- `windows.*`
- `downloads.*`
- `cookies.*`
- `storage.local.*`
- `scripting.*`

### `chrome.getPageMarkdown(tabId, opts?)`

Use it before custom read-only extraction for normal research or reading work.

- it depends on the converter service
- if the converter is unavailable, it throws and you should switch to a more specialized workflow instead of pretending the page was extracted

### Debugger special RPC methods

Use these when page execution precision matters.

- `debugger.evaluate` is the preferred one-shot execution path
- `debugger.attach` + `debugger.sendCommand` + `debugger.getEvents` + `debugger.detach` are for long-lived CDP sessions

## Default Vs Avoid

### Default to

- the exported package root from `@ank1015/llm-extension`
- `connect({ launch: true })`
- `chrome.call(...)`
- `chrome.getPageMarkdown(...)` before custom read-only extraction
- `debugger.evaluate` when executing page JavaScript

### Avoid by default

- `scripting.executeScript` as the default JS execution path on strict-CSP pages
- deep imports from package internals
- calling `chrome.run()` after `connect()`

## Examples

### 1) Start and query tabs

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
const tabs = (await chrome.call('tabs.query', {
  active: true,
  currentWindow: true,
})) as { id?: number }[];
```

### 2) Read the current tab as markdown

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
const tabs = (await chrome.call('tabs.query', {
  active: true,
  currentWindow: true,
})) as { id?: number }[];
const tabId = tabs[0]?.id;

if (typeof tabId !== 'number') {
  throw new Error('No active tab found');
}

const markdown = await chrome.getPageMarkdown(tabId);
```

### 3) Execute page JavaScript with `debugger.evaluate`

```ts
import { connect } from '@ank1015/llm-extension';

const chrome = await connect({ launch: true });
const evaluation = (await chrome.call('debugger.evaluate', {
  tabId,
  code: 'document.title',
})) as { result?: unknown; type?: string };

const title = evaluation.result;
```
