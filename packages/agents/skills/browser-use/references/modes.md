# Modes

Read this file immediately after [sdk-core.md](sdk-core.md).

Use this file to choose the mode first.

Once you know the mode, stop here and read the deeper file for that mode.
This file is only for classification, first choice, and fallback order.

## Choose The First Mode

| If the task looks like...                                                                              | Choose this mode first  | Preferred first abstraction                               | Read next                                          |
| ------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| read a page, summarize content, collect text, or do browser-assisted research without much interaction | read-only research      | `chrome.getPageMarkdown(...)`                             | [research-and-reading.md](research-and-reading.md) |
| click through a UI, fill forms, press buttons, select options, or navigate a webapp                    | interactive webapp work | `Window`                                                  | [webapp-flows.md](webapp-flows.md)                 |
| repeat the same browser task across many pages, items, or inputs                                       | batch automation        | low-level script with `connect(...)` + `chrome.call(...)` | [batch-automation.md](batch-automation.md)         |
| inspect cookies, downloads, network traffic, storage, or debugger/CDP state                            | browser state/debugging | low-level `connect(...)` + debugger special methods       | [state-and-debugging.md](state-and-debugging.md)   |
| the task matches a stable site-specific shortcut that already exists                                   | site-specific shortcut  | site script first                                         | [site-google.md](site-google.md)                   |

## How To Recognize Each Mode

### Read-only research

Use this when the task is mostly about reading or extracting.

Example:

- "Open this article, read it, and give me the key claims with source quotes."

### Interactive webapp work

Use this when the task requires UI actions and the page state changes because
of clicks, typing, or selections.

Example:

- "Log into the dashboard, open the billing page, and click the export button."

### Batch automation

Use this when the same browser operation must run repeatedly across many items
or many pages.

Example:

- "Visit each company page in this list and save the page title and main text."

### Browser state/debugging

Use this when DOM-level work is not enough and the task is really about browser
state, CDP, downloads, cookies, or network behavior.

Example:

- "Capture the request body sent when I submit this form and tell me which API
  endpoint it hits."

### Site-specific shortcut

Use this when a narrow script already exists for a common task on a known site.

Example:

- "Get the top Google search results for this query."

## Practical Fallback Order

Use this simple order when the first mode is unclear or when the first choice
fails:

1. Site-specific shortcut when a real script already exists for the exact task.
2. Read-only research when the task is mainly extraction or page understanding.
3. Interactive webapp work when the task needs clicks, typing, selects, or
   navigation through UI state.
4. Browser state/debugging when DOM-level work is not enough or the task is
   really about cookies, downloads, storage, network, or debugger behavior.
5. Batch automation when the task repeats across many items or pages.

## Normal To Switch Modes

The first mode is not a commitment.

It is normal to move between modes:

- from read-only research to interactive webapp work if the page content is not
  reachable through markdown extraction alone
- from interactive webapp work to browser state/debugging if the real task is
  about network requests, cookies, downloads, or CDP behavior
- from a one-off mode to batch automation once the single-item workflow is
  proven and needs to scale

## Do Not Put The Full Workflow Here

This file should stay thin.

Pick one mode and stop. Do not preload multiple mode references unless the task
later proves that you need to switch modes.

After choosing the mode, read the deeper file:

- [research-and-reading.md](research-and-reading.md)
- [webapp-flows.md](webapp-flows.md)
- [batch-automation.md](batch-automation.md)
- [state-and-debugging.md](state-and-debugging.md)
- [site-google.md](site-google.md)
