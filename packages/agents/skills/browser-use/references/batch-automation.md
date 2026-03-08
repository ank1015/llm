# Batch Automation

Use this file for repetitive browser work over many items or many pages.

This is the script-first mode for scraping, bulk extraction, URL harvesting,
and repeated browser tasks. Use it when the same low-level workflow must run
many times and you need something more deliberate than one-off browsing.

## Import Style

For this file, start with the low-level client import:

```ts
import { connect } from '@ank1015/llm-extension';
```

## When To Use This File

Use this file when:

- the same extraction or automation must run across many URLs, pages, or items
- you need to discover page structure once and then reuse that logic in a loop
- the task is closer to scripting than to interactive browsing

Use a different file when:

- the task is a one-off read or short research flow:
  [research-and-reading.md](research-and-reading.md)
- the task is mainly clicks, typing, selects, or step-by-step UI navigation:
  [webapp-flows.md](webapp-flows.md)
- the task is mainly about cookies, downloads, network capture, or debugger
  state: [state-and-debugging.md](state-and-debugging.md)
- a ready-made site-specific shortcut already exists:
  [site-google.md](site-google.md)

## Default Primitives

Stay low-level here:

- `connect({ launch: true })`
- `chrome.call(...)`
- `debugger.evaluate`

Use long-lived debugger sessions only when the batch task needs network or
state visibility in addition to extraction.

Do not treat `Window` as the normal batch tool in this file. If the task is
really interactive, switch to [webapp-flows.md](webapp-flows.md).

## Standard Batch Workflow

Use this order:

1. Define the unit of work first.
2. Do recon on one representative page.
3. Use low-level evaluation to understand the DOM structure or page data.
4. Identify the minimum fields, URLs, or ids you need to collect.
5. Write a tiny probe that proves extraction on 1 to 3 items.
6. Run a small batch.
7. Scale only after the small batch is stable.
8. Finish with simple task-relevant outputs.

Do not jump straight to a full run before the probe works.

## Two Common Batch Shapes

### Discover Then Expand

Use this when list pages lead to detail pages.

Pattern:

- collect URLs or item ids from search pages, listings, or feeds
- dedupe them immediately
- visit each item page one by one
- extract deeper detail from the item page

This is a good fit for search results, forums, product lists, and profile
directories.

### Incremental Page Collection

Use this when the list page already contains most of the useful data.

Pattern:

- stay on the list page
- scroll or paginate
- extract repeated batches
- dedupe each new batch
- stop when the target count or stopping condition is reached

This is a good fit for long feeds, infinite scroll pages, and paginated search
results.

## Low-Level Structure Discovery

Start on one deterministic page.

Recommended approach:

- inspect repeated containers, attributes, links, and text with
  `debugger.evaluate`
- prefer returning structured objects from page context instead of clicking
  through the UI when the data is already present
- identify stable ids, canonical URLs, or repeated unit boundaries early
- once the extraction logic is proven, freeze it into the script instead of
  rediscovering structure for every item

In practice, batch work is often:

- understanding one representative page with low-level evaluation
- extracting a list of URLs or ids
- running the same proven snippet repeatedly

## Batching Rules

- dedupe aggressively by stable id or canonical URL
- define stopping conditions up front
- prefer sequential execution first
- reuse one working tab when that keeps the flow simple
- switch to a new tab or clean tab per item only when site state becomes
  unstable
- keep retries light and conservative

## Light Retry And Resume

- retry only clearly transient failures such as load stalls or temporary empty
  batches
- do not keep retrying structural failures
- if the run is long or expensive, keep a simple resume marker such as the last
  processed URL, page number, or seen-id set
- keep checkpointing brief and optional, not a framework

## Keep Outputs Simple

- save the actual collected data when the task needs it
- save URL lists when discovery is the main output
- add short notes only when needed to explain partial failures or stopping
  reasons

Do not define `summary.json` or `results.json` in this file.

## Examples

### 1) Collect Result URLs Then Visit Each Result

Task shape:

- collect search result URLs first, then open each result page and extract
  detail fields

Default path:

- discover the result unit structure with `debugger.evaluate`
- extract a deduped list of result URLs
- prove the detail-page extractor on 1 to 3 URLs
- then run the loop over the full list

### 2) Infinite Scroll Collection

Task shape:

- extract repeated items from a long list or feed without opening detail pages

Default path:

- discover the repeated unit structure once
- extract the initial batch
- scroll or paginate
- collect new batches and dedupe them
- stop when you hit the target count or repeated stale rounds show no progress

### 3) Batch Over A Provided URL List

Task shape:

- the user already has the URLs and wants the same fields extracted from each

Default path:

- prove one extraction snippet on a single representative URL
- reuse that same snippet for the list
- keep the loop sequential first
- only complicate tab management if the site becomes unstable

## Not Covered Here

Use other references when the task stops being low-level batch scripting:

- [research-and-reading.md](research-and-reading.md)
- [state-and-debugging.md](state-and-debugging.md)
- [webapp-flows.md](webapp-flows.md)
- [site-google.md](site-google.md)
