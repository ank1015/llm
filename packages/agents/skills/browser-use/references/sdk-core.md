# SDK Core

This file is the shortest possible guide to the browser SDK primitives an
agent should trust first.

It is not a full API reference. It tells you how to start, which primitive to
pick first, and which lower-level exports are not normal skill-level entry
points.

## Import Style

Import from `@ank1015/llm-extension`.

```ts
import { connect, Window } from '@ank1015/llm-extension';
```

Import only what you use. For low-level work, `connect` is enough. For
interactive `Window` work, read [webapp-flows.md](webapp-flows.md).

## Mental Model

- `connect(...)` opens a client connection to the local Chrome bridge.
- That client is a `ChromeClient`.
- `chrome.call(method, ...args)` is the generic primitive. It maps method
  strings like `tabs.query` to `chrome.tabs.query(...)` inside the extension.
- Some methods are special RPC helpers rather than direct Chrome API methods:
  - `debugger.evaluate`
  - `debugger.attach`
  - `debugger.sendCommand`
  - `debugger.getEvents`
  - `debugger.detach`
- `chrome.getPageMarkdown(...)` is a higher-level read-only helper built on top
  of the low-level client.
- `Window` is a separate higher-level wrapper for interactive browser tasks. Do
  not learn full `Window` usage here; read [webapp-flows.md](webapp-flows.md)
  later when the task involves observe/click/type/select flows.

## Start Here

Use these defaults unless you have a clear reason not to:

| If the task is...           | Start with...                              | Why                                                                                            |
| --------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| almost any browser task     | `connect({ launch: true })`                | it is the normal entry point and can auto-open Chrome if needed                                |
| a generic browser operation | `chrome.call(...)`                         | it is the main low-level primitive and covers most Chrome APIs                                 |
| read-only page extraction   | `chrome.getPageMarkdown(tabId)`            | it is simpler than custom DOM extraction when the converter service is available               |
| execute page JavaScript     | `debugger.evaluate`                        | it is more reliable than `scripting.executeScript` on strict-CSP pages                         |
| long-lived CDP work         | `debugger.attach` + `debugger.sendCommand` | it keeps a debugger session open for network, Page, DOM, and Runtime work                      |
| event-driven waiting        | `chrome.subscribe(...)`                    | it is useful for long-running or event-driven tasks, not as the normal starting point          |
| interactive webapp flows    | `Window`                                   | use it only when the task needs observe/action helpers; see [webapp-flows.md](webapp-flows.md) |

## Blessed Defaults

### `connect({ launch: true })`

Use this as the default way to start.

- `launch: true` is the normal skill-level default for automation and agent
  work.
- `port` and `host` are available, but most tasks should not need custom
  values.
- `launchTimeout` is only worth changing when startup timing is part of the
  task.
- when you write a standalone Node script with `connect(...)`, explicitly
  `process.exit(0)` or `process.exit(1)` after cleanup.
  The Chrome connection can keep the process alive even after the script logic
  is finished.

### `chrome.call(method, ...args)`

This is the main low-level primitive.

- Use it for Chrome APIs such as `tabs.*`, `windows.*`, `downloads.*`,
  `cookies.*`, and `storage.local.*`.
- Prefer it when you already know the exact Chrome API call you want.
- Treat it as the default fallback even if you later use higher-level helpers.

### `chrome.getPageMarkdown(tabId, opts?)`

This is the default read-only page extraction path.

- Use it before writing custom DOM extraction for normal research or reading
  tasks.
- It reads the tab HTML and sends it through the local HTML-to-markdown
  service.
- It depends on the converter service being available. If that service is not
  running, the helper will not be useful for the task.

### `chrome.subscribe(event, callback)`

Use this for events, not as the default task primitive.

- Good for waiting on browser events or streaming updates.
- Not the normal first choice for one-off tasks.

### Debugger special RPC methods

Use these when page execution precision matters.

- `debugger.evaluate` is the preferred one-shot execution path.
- `debugger.evaluate` returns an object shaped like `{ result, type }`.
- `debugger.attach` + `debugger.sendCommand` + `debugger.getEvents` +
  `debugger.detach` are for long-lived CDP sessions.
- These are first-class tools in this SDK. Do not treat them as hacks.

### `Window`

`Window` is a higher-level abstraction for interactive tasks.

- Mention it early, but do not use this file as the place to learn it.
- Read [webapp-flows.md](webapp-flows.md) once that file is completed when the
  task is about observe/action flows rather than raw API control.

## Default Vs Avoid

### Default to

- `connect({ launch: true })` as the normal entry point.
- `chrome.call(...)` for exact Chrome API work.
- `chrome.getPageMarkdown(...)` before custom read-only extraction logic.
- `debugger.evaluate` when executing page JavaScript.
- long-lived debugger session methods when you need CDP domains such as
  `Network`, `Page`, or `Runtime`.

### Avoid by default

- `scripting.executeScript` as the default JS execution path.
  It can work, but strict CSP is a common failure case. Prefer
  `debugger.evaluate` unless you specifically need `scripting`.
- `createChromeClient`, protocol types, native-host helpers, and transport
  utilities as skill-level entry points.
  They are part of the package, but they are not the normal way an agent should
  start browser work.
- full `Window` usage in this file.
  Keep this file focused on core primitives and defer interactive workflow
  details to later references.

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
const tabs = (await chrome.call('tabs.query', {
  active: true,
  currentWindow: true,
})) as { id?: number }[];
const tabId = tabs[0]?.id;

if (typeof tabId !== 'number') {
  throw new Error('No active tab found');
}

const evaluation = (await chrome.call('debugger.evaluate', {
  tabId,
  code: 'document.title',
})) as { result?: unknown; type?: string };

const title = evaluation.result;
```

## Not Covered Here

This file does not teach the full browser skill.

Use later files for:

- `Window` interaction patterns in [webapp-flows.md](webapp-flows.md)
- batch scripting patterns in [batch-automation.md](batch-automation.md)
- state and debugger-heavy workflows in [state-and-debugging.md](state-and-debugging.md)
- site-specific shortcuts such as Google flows in [site-google.md](site-google.md)
