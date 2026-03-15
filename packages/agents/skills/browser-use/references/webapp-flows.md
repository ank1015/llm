# Webapp Flows

Use this file for interactive browser work.

This is the playbook for low-level interactive browser flows now that the browser package is RPC-only.

## Import Style

Start with:

```ts
import { connect } from '@ank1015/llm-extension';
```

## Interactive Mental Model

- use `connect({ launch: true })`
- locate the right tab or create one with `tabs.*` or `windows.*`
- inspect page state with `debugger.evaluate`
- perform UI actions with direct Chrome APIs or DOM scripts
- verify the post-action state before continuing

There is no snapshot-driven helper loop anymore. You must make the state checks explicit.

## Default Interactive Loop

1. Connect to Chrome.
2. Open or focus the correct tab.
3. Inspect the current page state with `debugger.evaluate`.
4. Perform the action:
   - click a DOM element with `debugger.evaluate`
   - type or set a value with `debugger.evaluate`
   - use exact Chrome APIs when they exist
5. Verify the next state with another explicit check.
6. Repeat until the task is done.

## Common patterns

### Buttons and links

- resolve the target with page JS
- click it through `debugger.evaluate`
- check the next URL, DOM state, or both

### Forms

- fill inputs with explicit page JS
- dispatch the right events if the page depends on them
- submit and verify the next state

### Selects and toggles

- set the value or checked state in page JS
- dispatch `input` and `change` when needed
- verify any resulting UI change

### SPA transitions

- never assume a click finished the job
- check for route changes, panel changes, or new DOM markers after every meaningful step

## Prefer explicit checks

Use `debugger.evaluate` to ask small, deterministic questions:

- is the button present?
- what is the current URL?
- did the form field update?
- is the modal open?
- did the result count change?

This is the replacement for the old observe/action abstraction.

## When To Leave This File

Switch to:

- [state-and-debugging.md](state-and-debugging.md) when the task is really about cookies, downloads, network, or other browser-managed state
- [batch-automation.md](batch-automation.md) when the same UI flow must repeat across many items
- [research-and-reading.md](research-and-reading.md) when the task becomes mostly read-only
