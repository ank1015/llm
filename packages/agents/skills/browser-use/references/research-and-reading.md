# Research And Reading

Use this file for read-only browser work.

This is the default playbook after [modes.md](modes.md) routes a task into
read-only research. The goal is to read pages, collect text, add screenshots
only when they are actually needed, and produce a light research output set.

## Import Style

For this file, start with the low-level client import:

```ts
import { connect } from '@ank1015/llm-extension';
```

## When To Use This File

Use this file when the task is mostly about understanding page content rather
than driving a UI.

Use a different file when:

- the task needs clicks, typing, selects, or step-by-step UI navigation:
  [webapp-flows.md](webapp-flows.md)
- the task is really about cookies, storage, downloads, requests, or debugger
  state: [state-and-debugging.md](state-and-debugging.md)
- the same reading workflow must run repeatedly across many items or pages:
  [batch-automation.md](batch-automation.md)
- a real site-specific shortcut already exists for the task:
  [site-google.md](site-google.md)

## Default Primitives

Stay with the low-level SDK surface from
[sdk-core.md](sdk-core.md):

- `connect({ launch: true })`
- `chrome.call(...)`
- `chrome.getPageMarkdown(tabId, opts?)`
- raw debugger methods only when screenshots or a page-level fallback are
  needed

## First Move: `chrome.getPageMarkdown(...)`

Start with `chrome.getPageMarkdown(tabId, opts?)`.

It is the default read-only extraction path because it:

- works on an arbitrary tab id
- waits for the tab to finish loading
- reads full page HTML through the debugger path
- sends that HTML to the local converter service at
  `http://localhost:8080/convert`

Treat this as the first move before writing custom extraction logic.

If the converter service is unavailable, this path is unavailable for the task.
At that point, either switch modes or use a more specialized workflow instead
of pretending the markdown is good enough.

## Read-Only Workflow

Use this order:

1. Connect to Chrome with `connect({ launch: true })`.
2. Resolve the target tab with `chrome.call('tabs.query', ...)` or a known
   `tabId`.
3. Extract markdown with `chrome.getPageMarkdown(tabId, opts?)`.
4. Decide whether text alone is enough for the task.
5. Capture targeted screenshots only if visual evidence matters.
6. Save outputs and write a short summary of what was found.

This mode should stay simple. Do not add interaction unless the task proves
that reading alone is insufficient.

## When Screenshots Are Needed

Screenshots are companion evidence, not a default step.

Add them when the task depends on something markdown may lose or flatten:

- charts or graphs
- tables or dense visual layouts
- layout-dependent meaning
- evidence capture where you need to literally inspect the image

If the task is fully answered by text, skip screenshots.

## Screenshot Handling Rule

If you capture a screenshot:

- save it to a file
- use the image-reading tool on that saved file to actually inspect it
- do not pretend that base64 data or a file path alone means you have seen the
  image

The browser SDK can give you screenshot bytes, but visual inspection only
happens after the image is saved and then read with the image-reading tool.

## Generic Multi-Page Collection

Use a page-by-page loop, not a giant one-shot scrape.

Recommended pattern:

1. Start with one page first and confirm the output quality.
2. Define what one unit of collection is for this task.
   It might be one article, one result page, one profile, or one forum page.
3. Save markdown for each page separately.
4. Add screenshots only for the pages where visual evidence matters.
5. Stop when:
   - the task is already satisfied
   - the next page is missing
   - the collection boundary is reached

Keep the collection boundary explicit. Examples: first 3 pages, first 20
results, all pages until no next link, or all pages in a provided list.

If the task turns into a real crawl across many pages, switch to
[batch-automation.md](batch-automation.md) once one page of markdown extraction
is proven.

## Light Output Contract

Keep research outputs light:

- one markdown file per page
- optional screenshot files for visual evidence
- one short merged notes or result file summarizing what was found

Do not turn a small reading task into a full batch artifact pipeline. That
belongs in [batch-automation.md](batch-automation.md).

## Examples

### 1) Single page read

Task shape:

- read one article or documentation page and summarize the key points

Default path:

- resolve the tab
- run `chrome.getPageMarkdown(tabId)`
- save the markdown
- write a short summary from that markdown

### 2) Paginated or multi-page collection

Task shape:

- collect content across a few pages, such as search results, forum pages, or
  a short list of links

Default path:

- define the collection boundary first
- read one page and confirm the format is useful
- save one markdown file per page
- switch to [batch-automation.md](batch-automation.md) if the task becomes a
  larger crawl
- stop when the boundary is reached or no next page exists

### 3) Visual-evidence case

Task shape:

- inspect a chart, pricing table, dashboard card, or other layout-sensitive
  content

Default path:

- extract markdown first for the text
- capture only the screenshots needed for the visual claim
- save those images to files
- inspect the image files with the image-reading tool before making
  visual statements

## Not Covered Here

Use other references when the task stops being simple read-only research:

- [webapp-flows.md](webapp-flows.md) for UI-driven work
- [state-and-debugging.md](state-and-debugging.md) for network, cookie,
  storage, download, or debugger-heavy tasks
- [batch-automation.md](batch-automation.md) when the reading workflow needs to
  scale
- [site-google.md](site-google.md) when a site-specific shortcut exists
