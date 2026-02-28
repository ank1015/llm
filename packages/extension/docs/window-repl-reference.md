# Window REPL Function Reference

This document is for agent usage in a REPL where a `window` object is already provided.
It focuses only on callable functions and their input/output behavior.

## Full Type Interface (Instance Surface)

```ts
export interface WindowOpenOptions {
  newTab?: boolean;
  active?: boolean;
  tabId?: number;
  timeoutMs?: number;
}

export interface WindowScreenshotOptions {
  tabId?: number;
  fullPage?: boolean;
}

export interface WindowEvaluateOptions {
  tabId?: number;
  timeoutMs?: number;
}

export interface WindowDownloadOptions {
  timeoutMs?: number;
  saveAs?: boolean;
}

export interface WindowGetPageOptions {
  tabId?: number;
  url?: string;
  timeoutMs?: number;
  converterUrl?: string;
}

export type ObserveFilter =
  | 'interactive'
  | 'buttons'
  | 'links'
  | 'inputs'
  | 'text'
  | 'forms'
  | 'media'
  | 'alerts';

export interface WindowObserveOptions {
  tabId?: number;
  filters?: ObserveFilter[];
  semanticFilter?: string;
  max?: number;
  timeoutMs?: number;
}

export interface WindowActionOptions {
  tabId?: number;
  timeoutMs?: number;
}

export interface WindowTypeOptions extends WindowActionOptions {
  clearBeforeType?: boolean;
  pressEnter?: boolean;
}

export type WindowScrollBehavior = 'auto' | 'smooth';

export interface WindowScrollOptions extends WindowActionOptions {
  targetId?: string;
  x?: number;
  y?: number;
  to?: 'top' | 'bottom' | 'left' | 'right';
  behavior?: WindowScrollBehavior;
}

export interface WindowTab {
  id?: number;
  windowId?: number;
  active?: boolean;
  status?: string;
  url?: string;
  title?: string;
}

export interface WindowInstance {
  open(url: string, options?: WindowOpenOptions): Promise<WindowTab>;
  tabs(): Promise<WindowTab[]>;
  switchTab(tabId: number): Promise<WindowTab>;
  closeTab(tabId?: number): Promise<void>;
  back(tabId?: number): Promise<WindowTab>;
  reload(tabId?: number): Promise<WindowTab>;
  current(): Promise<WindowTab | null>;

  screenshot(options?: WindowScreenshotOptions): Promise<string>;
  observe(options?: WindowObserveOptions): Promise<string>;
  click(targetId: string, options?: WindowActionOptions): Promise<string>;
  hover(targetId: string, options?: WindowActionOptions): Promise<string>;
  focus(targetId: string, options?: WindowActionOptions): Promise<string>;
  pressEnter(targetId: string, options?: WindowActionOptions): Promise<string>;
  clear(targetId: string, options?: WindowActionOptions): Promise<string>;
  toggle(targetId: string, options?: WindowActionOptions): Promise<string>;
  type(targetId: string, value: string, options?: WindowTypeOptions): Promise<string>;
  select(targetId: string, value: string, options?: WindowActionOptions): Promise<string>;
  scroll(options?: WindowScrollOptions): Promise<string>;

  download(url: string, downloadPath: string, options?: WindowDownloadOptions): Promise<string>;
  evaluate<T = unknown>(code: string, options?: WindowEvaluateOptions): Promise<T>;
  getPage(input?: WindowGetPageOptions | number | string): Promise<string>;
}
```

## Method Details

### `open(url, options?) -> Promise<WindowTab>`

- Purpose: navigate an existing tab or open a new tab.
- Inputs:
  - `url`: required, non-empty string.
  - `options.newTab`: `true` to open new tab.
  - `options.tabId`: navigate a specific tab.
  - `options.active`: active state when creating/updating tab. Default is `true`.
  - `options.timeoutMs`: navigation wait timeout.
- Return:
  - `WindowTab` for the loaded destination.
- Notes:
  - Resolves after load completes.

### `tabs() -> Promise<WindowTab[]>`

- Purpose: list tabs in the scoped window.
- Return:
  - array of `WindowTab`.

### `switchTab(tabId) -> Promise<WindowTab>`

- Purpose: activate tab.
- Return:
  - activated `WindowTab`.
- Notes:
  - Resolves after load settles.

### `closeTab(tabId?) -> Promise<void>`

- Purpose: close a tab.
- Inputs:
  - `tabId` optional. If omitted, closes current active tab.
- Return:
  - `void`.

### `back(tabId?) -> Promise<WindowTab>`

- Purpose: go back in tab history.
- Return:
  - resulting `WindowTab`.
- Notes:
  - Resolves after load settles.

### `reload(tabId?) -> Promise<WindowTab>`

- Purpose: reload tab.
- Return:
  - reloaded `WindowTab`.
- Notes:
  - Resolves after load settles.

### `current() -> Promise<WindowTab | null>`

- Purpose: get active tab.
- Return:
  - active `WindowTab` or `null`.

### `screenshot(options?) -> Promise<string>`

- Purpose: capture screenshot as base64 PNG.
- Inputs:
  - `options.tabId` optional.
  - `options.fullPage` optional. Default is viewport-only (`false`).
- Return:
  - base64-encoded PNG image string
- Agent REPL integration note:
  - In the `repl` tool, return this base64 string directly when you want image output.
  - Do not slice/truncate/inspect or wrap it in an object.
  - Direct returns are converted to an image attachment (`Image attached`) by the tool.

### `observe(options?) -> Promise<string>`

- Purpose: get markdown snapshot of page structure and actionable ids.
- Inputs:
  - `options.tabId` optional.
  - `options.filters` optional section filters.
  - `options.max` optional max item cap.
  - `options.semanticFilter` optional semantic query.
  - `options.timeoutMs` optional wait timeout.
- Return:
  - markdown string containing summary and elements (including `E*` ids).

### Action Methods (`Promise<string>`)

Methods:

- `click(targetId, options?)`
- `hover(targetId, options?)`
- `focus(targetId, options?)`
- `pressEnter(targetId, options?)`
- `clear(targetId, options?)`
- `toggle(targetId, options?)`
- `type(targetId, value, options?)`
- `select(targetId, value, options?)`
- `scroll(options?)`

Action input rules:

- `targetId` should come from `observe()` interactive ids (`E1`, `E2`, ...).
- `type` requires string `value`.
- `select` requires string `value`.
- `scroll` supports either page scroll (`x`, `y`, `to`) or target scroll (`targetId`).

Action return format:

- Returns compact markdown.
- Standard sections:
  - `### Action Result`
  - action name
  - status (`success` or `failed`)
  - action message
  - URL outcome:
    - `URL changed to: ...`
    - or `URL: unchanged`
  - optional `### Detected Changes` summary when URL is unchanged.

Special action return strings:

- If observe snapshot is missing for that tab:
  - `You must observe before act`
- If id is not in latest observe snapshot:
  - returns target-not-found message string.

### `download(url, downloadPath, options?) -> Promise<string>`

- Purpose: trigger browser download and wait for final state.
- Inputs:
  - `url`: required non-empty string.
  - `downloadPath`: required non-empty relative/target path.
  - `options.timeoutMs`: optional download timeout.
  - `options.saveAs`: optional prompt behavior.
- Return:
  - status string, for example:
    - `Downloaded to ...`
    - `Download interrupted...`
    - `Download state unknown`

### `evaluate<T>(code, options?) -> Promise<T>`

- Purpose: execute arbitrary JavaScript and get raw result.
- Inputs:
  - `code`: required non-empty JS code string.
  - `options.tabId`: optional target tab.
  - `options.timeoutMs`: optional wait timeout.
- Return:
  - evaluated value typed as `T`.

### `getPage(input?) -> Promise<string>`

- Purpose: return page markdown text for a tab or URL.
- Accepted input forms:
  - `getPage(tabIdNumber)`
  - `getPage(urlString)`
  - `getPage({ tabId })`
  - `getPage({ url })`
  - `getPage({ tabId, timeoutMs, converterUrl })`
  - `getPage({ url, timeoutMs, converterUrl })`
- Return:
  - markdown string for the page content.
- Converter fallback:
  - if converter service fails/unavailable, returns exact string:
    - `service not running use observe tool`
