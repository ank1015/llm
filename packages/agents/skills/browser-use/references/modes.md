# Modes

Read this file immediately after [sdk-core.md](sdk-core.md).

Use this file to choose the mode first.

## Choose The First Mode

| If the task looks like... | Choose this mode first | Preferred first abstraction | Read next |
| --- | --- | --- | --- |
| read a page, summarize content, collect text, or do browser-assisted research without much interaction | read-only research | `chrome.getPageMarkdown(...)` | [research-and-reading.md](research-and-reading.md) |
| click through a UI, fill forms, press buttons, select options, or navigate a webapp | interactive webapp work | raw RPC with `connect(...)`, `chrome.call(...)`, and `debugger.evaluate` | [webapp-flows.md](webapp-flows.md) |
| repeat the same browser task across many pages, items, or inputs | batch automation | low-level script with `connect(...)` + `chrome.call(...)` | [batch-automation.md](batch-automation.md) |
| inspect cookies, downloads, network traffic, storage, or debugger/CDP state | browser state/debugging | low-level `connect(...)` + debugger special methods | [state-and-debugging.md](state-and-debugging.md) |
| the task matches a stable site-specific shortcut that already exists | site-specific shortcut | site script first | [site-google.md](site-google.md) |

## Practical Fallback Order

1. Site-specific shortcut when a real script already exists for the exact task.
2. Read-only research when the task is mainly extraction or page understanding.
3. Interactive webapp work when the task needs clicks, typing, selects, or navigation through UI state.
4. Browser state/debugging when DOM-level work is not enough or the task is really about cookies, downloads, storage, network, or debugger behavior.
5. Batch automation when the task repeats across many items or pages.

## Normal To Switch Modes

It is normal to move between modes:

- from read-only research to interactive webapp work if the page content is not reachable through markdown extraction alone
- from interactive webapp work to browser state/debugging if the real task is about network requests, cookies, downloads, or CDP behavior
- from a one-off mode to batch automation once the single-item workflow is proven and needs to scale

## Deeper references

- [research-and-reading.md](research-and-reading.md)
- [webapp-flows.md](webapp-flows.md)
- [batch-automation.md](batch-automation.md)
- [state-and-debugging.md](state-and-debugging.md)
- [site-google.md](site-google.md)
