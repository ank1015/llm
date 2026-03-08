# Webapp Flows

Use this file for interactive browser work.

This is the default playbook after [modes.md](modes.md) routes a task into
interactive webapp work. Use it when the task needs clicks, typing, selection,
scrolling, or step-by-step UI state changes.

## Import Style

For interactive flows, import `Window` from the SDK:

```ts
import { Window } from '@ank1015/llm-extension';
```

If the script also mixes low-level browser calls with `Window`, use:

```ts
import { connect, Window } from '@ank1015/llm-extension';
```

## Window Mental Model

- `Window` is the default interactive abstraction.
- `new Window()` creates and owns a Chrome window. Wait for `window.ready`
  before using it.
- `new Window(windowId)` reuses an existing Chrome window.
- `Window` tab operations are scoped to that window.
- `observe()` captures one tab state, persists a snapshot, and returns a
  readable view of that snapshot.
- Action methods resolve targets from the latest observe snapshot for that tab.
- `E*` ids are snapshot-local. Treat them as disposable, not stable.
- Do not treat `Window` as the default tool for arbitrary tabs in unrelated
  Chrome windows.

## Default Interactive Loop

Use this loop unless you have a clear reason not to:

1. Create or reuse a `Window`.
2. `open(...)` or `switchTab(...)` until the correct tab is active in that
   window.
3. Run `observe()` to understand the current page state.
4. Choose the target id from the latest observation.
5. Act with one of:
   `click`, `type`, `select`, `toggle`, `clear`, `pressEnter`, `hover`,
   `focus`, or `scroll`.
6. Inspect the action message and the page state to see what changed.
7. Re-observe whenever the page changes meaningfully, a target id goes stale,
   or navigation or SPA transitions occur.

This loop matters more than any single method.

## Small Surface To Trust First

Use only this small `Window` surface by default:

- navigation and tab control: `open`, `tabs`, `current`, `switchTab`, `back`,
  `reload`, `closeTab`
- observation: `observe`
- actions: `click`, `type`, `select`, `clear`, `toggle`, `pressEnter`,
  `hover`, `focus`, `scroll`
- inspection escape hatches: `evaluate`, `screenshot`, `getPage`

Do not turn this file into a full method-by-method reference.

## Common Interactive Patterns

### Forms and submit flows

Default pattern:

- open the target page
- observe to find the relevant inputs and submit control
- `type(...)`, `select(...)`, `toggle(...)`, or `clear(...)` as needed
- use `click(...)` on the submit control or `pressEnter(...)` on the relevant
  field
- inspect the result
- re-observe to confirm the next state

### Buttons and links

Use `click(...)` first.

After the click, do not assume success from the click alone. Confirm from the
returned action message and a fresh observation of the page state.

### Selects, checkboxes, and toggles

- use `select(...)` for `<select>` controls
- use `toggle(...)` for checkbox-like state changes
- re-observe after the change if the rest of the page depends on that state

### Modal or drawer flows

Treat modals and drawers as state changes, not as the same page you observed
before.

- observe the base page
- act to open the modal or drawer
- observe again once it appears
- act inside that new state
- observe again after submit, close, or cancel

### Tabbed interfaces

Treat each tab switch as a state change.

- observe the current tab content
- click the tab control
- observe again before using any new target ids inside the newly visible panel

### SPA transitions

Single-page apps may update content without a full page load.

After actions that change routes, panels, or result lists:

- inspect the returned action message
- confirm with a fresh observation
- trust visible content changes more than assumptions about the click

## Immediate Recovery Rules

- if you did not observe first, actions can fail with
  `You must observe before act`; the fix is to observe first
- if a target is not found, observe again before assuming the UI is broken
- if the page changed after an action, do not reuse old `E*` ids
- use the returned action message plus a fresh observation to confirm progress

## Advanced Note On `observe()`

Keep `observe()` simple most of the time, but remember:

- `filters` can narrow the returned view when the full page is noisy
- `semanticFilter` is an optional refinement layer, not the default path
- observation output includes truncation notes, warnings, and the full snapshot
  file path
- hidden and offscreen elements may be excluded, so a missing target can mean
  “scroll or change state and observe again”

## When To Leave This File

Move to lower-level methods only when `Window` is no longer a good fit:

- if the action helpers are not expressive enough for the page
- if the page needs exact JavaScript execution or debugger-level control
- if the real task is about cookies, downloads, storage, requests, or other
  browser state

Use the later references instead of overloading this file:

- [state-and-debugging.md](state-and-debugging.md)
- [diagnostics-and-failures.md](diagnostics-and-failures.md)
- [pitfalls.md](pitfalls.md)

## Examples

### 1) Form fill and submit

Task shape:

- open a settings page, fill two fields, and submit the form

Default path:

- `open(...)`
- `observe()`
- `type(...)` and `select(...)`
- `click(...)` or `pressEnter(...)`
- re-observe to confirm the success state or validation state

### 2) Modal or tabbed UI flow

Task shape:

- click “Edit”, work inside a modal, and save

Default path:

- observe the base page
- click the control that opens the modal or changes the visible tab
- observe again after the UI changes
- act inside the new state using fresh ids
- observe again after save or close

### 3) SPA navigation flow

Task shape:

- click into a dashboard section and confirm the page actually changed

Default path:

- observe the starting view
- click the navigation control
- do not assume success from the click alone
- observe again and confirm from updated content, URL, or both
