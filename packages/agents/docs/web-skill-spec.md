# `web` Skill Spec

## Status

Implemented helper-backed browser API and bundled skill for `@ank1015/llm-agents`.

This document captures the implemented public API, skill behavior, and design rationale for the
`web` skill that gives the general-purpose agent a practical, reusable browser capability layer
without exposing `@ank1015/llm-extension` directly.

## Goal

The `web` skill should let the agent handle broad browser tasks through `@ank1015/llm-agents`
alone:

- read information from websites
- navigate and inspect web apps
- perform user-like actions when needed
- debug pages and network activity
- manage tabs and browser state
- monitor downloads and uploads
- verify results after actions

The agent should not need any direct knowledge of the extension package layout, transport details,
or raw native-host workflow.

## Core Design Principles

### 1. Browser capability should be helper-backed

The extension package is powerful but too low-level to teach directly as a skill. The `web` skill
should instead teach a stable agent-facing model exposed from `@ank1015/llm-agents`.

### 2. Keep the core API low-level but logical

The public surface should be strong enough for unfamiliar websites and odd edge cases, but not so
high-level that it becomes brittle across sites.

The intended balance is:

- strong browser/session primitives
- strong debugger/network primitives
- one powerful DOM evaluation primitive
- rich skill docs with recipes

### 3. Avoid fragile site-specific abstractions

The public API should not ship helpers like `readGmailInbox()` or `getTopTweets()`.

Instead, the skill should teach patterns that combine:

- `openTab()`
- `waitForLoad()`
- `waitFor()`
- `waitForIdle()`
- `evaluate()`
- debugger/network helpers

### 4. Verification is first-class

Most browser failures come from acting before the page is ready or assuming an action succeeded.
The helper API and the skill docs should emphasize:

- browser-level readiness
- app-level readiness
- explicit post-action verification

## Relationship To `@ank1015/llm-extension`

`@ank1015/llm-extension` remains the lower-level browser transport and CDP/RPC layer.

`@ank1015/llm-agents` should expose a stable browser helper layer on top of it.

The agent should learn:

- `connectWeb()`
- `WebBrowser`
- `WebTab`
- `WebDebuggerSession`

The agent should not learn:

- extension package file layout
- native messaging details
- raw ChromeClient lifecycle
- package-internal bridge setup

## Skill Type

The `web` skill should be a helper-backed skill because:

- repeated browser lifecycle setup should not be rewritten per task
- tab, debugger, download, and upload workflows benefit from stable package APIs
- process cleanup should be handled by the helper layer instead of every temp script
- the skill will need examples and recipes that assume a stable exported API

## Helper Exports

The helper-backed API is exported from `@ank1015/llm-agents`.

### Top-Level Exports

```ts
import {
  connectWeb,
  withWebBrowser,
  type ConnectWebOptions,
  type WebBrowser,
  type WebBrowserOptions,
  type WebTab,
  type WebTabInfo,
  type WebWaitForOptions,
  type WebDebuggerSession,
  type WebNetworkCapture,
  type WebDownloadInfo,
} from '@ank1015/llm-agents';
```

### `connectWeb(options?)`

Connect to the local browser bridge and return a managed `WebBrowser`.

Responsibilities:

- hide `@ank1015/llm-extension` details
- manage underlying socket/client lifecycle
- provide a real `close()` implementation so scripts can finish cleanly without `process.exit()`

Expected options:

- `host?`
- `port?`
- `launch?`
- `launchTimeout?`

### `withWebBrowser(fn, options?)`

Open a managed browser session, run a callback, and always close the session afterward.

This should be the safest default for temp scripts and skill examples.

Responsibilities:

- connect once
- provide a `WebBrowser`
- guarantee cleanup in `finally`

## `WebBrowser`

Represents a managed browser session.

### `browser.close()`

Close the managed browser helper session and underlying extension client.

This method is required. It fixes the current issue where raw extension connections can keep Node
processes alive.

### `browser.openTab(url, options?)`

Open a tab and return a `WebTab`.

Expected options:

- `active?`
- `windowId?`
- `pinned?`

Used in:

- reading docs pages
- opening Gmail/X/GitHub in temp tabs
- opening verification tabs the user can inspect

### `browser.listTabs(filter?)`

Return all matching tabs as structured tab info.

Useful for:

- browser state inspection
- finding app tabs like Gmail or Notion
- cleanup flows

Expected filter support:

- `active?`
- `windowId?`
- `url?`
- raw passthrough support for Chrome tab query filters where practical

### `browser.findTabs(predicateOrFilter)`

Find tabs by either:

- a filter object
- a predicate over tab info

Useful for:

- "find the Notion tab"
- "reuse an existing Gmail tab if present"
- "find all tabs on this host"

### `browser.closeTabs(ids)`

Close one or more tabs.

### `browser.closeOtherTabs(keepIds)`

Close all tabs except the specified ones.

Used in:

- cleanup tasks like "close everything except Notion"

### `browser.chrome(method, ...args)`

Raw Chrome API escape hatch.

Examples:

- `browser.chrome('tabs.query', { active: true, currentWindow: true })`
- `browser.chrome('windows.update', id, { focused: true })`
- `browser.chrome('cookies.getAll', { domain: 'claude.ai' })`
- `browser.chrome('downloads.search', query)`

This is intentionally part of the design so the agent is never blocked by missing high-level
wrappers.

### `browser.listDownloads(query?)`

List browser downloads with a structured return type.

This is a convenience helper over `downloads.search`.

Useful for:

- download verification
- locating downloaded files
- polling download progress

### `browser.waitForDownload(filter, options?)`

Poll or subscribe until a download matching the filter appears or completes.

Useful for:

- "download this CSV and confirm success"
- "wait until the PDF finishes downloading"

## `WebTab`

Represents a browser tab with page-oriented helpers.

### `tab.info()`

Return structured tab metadata such as:

- `id`
- `title`
- `url`
- `status`
- `active`
- `windowId`

Used for:

- verification
- logging
- control flow decisions

### `tab.goto(url, options?)`

Navigate the current tab to a URL.

Useful for:

- reusing a temp tab across multiple page states
- Gmail compose flows
- debugger-driven experiments

### `tab.reload()`

Reload the tab.

Useful for:

- app refresh tasks
- state reset during iteration

### `tab.focus()`

Focus the tab.

Useful for:

- user-visible verification tasks
- cases where site behavior depends on the active tab

### `tab.close()`

Close the current tab.

### `tab.waitForLoad({ timeoutMs? })`

Wait for browser-level page load completion.

This should wrap the common `tabs.get().status === 'complete'` polling pattern.

### `tab.waitFor(options)`

Wait for app-level readiness or a specific page condition.

Expected option support:

- `selector?`
- `text?`
- `urlIncludes?`
- `predicate?`
- `timeoutMs?`
- `pollIntervalMs?`

This is one of the most important helpers because app readiness is not the same as browser load.

Used in:

- waiting for Gmail inbox rows
- waiting for X timeline articles
- waiting for docs content to hydrate

### `tab.waitForIdle(ms)`

Wait an additional settle period after load or after an action.

Useful for:

- SPAs
- post-load hydration
- feeds
- async post-action rendering

### `tab.evaluate<T>(code, options?)`

Evaluate arbitrary JavaScript in the page via debugger-based execution and return typed results.

This is the core DOM primitive and the main page-specific escape hatch.

Expected option support:

- `awaitPromise?`
- `userGesture?`
- `returnByValue?`

This method should be ergonomic and reliable because most page reading and custom interactions will
be built on top of it.

Used in:

- inspecting Polymarket docs pages
- extracting Gmail message rows
- composing and validating Gmail drafts
- reading X timeline posts
- probing selectors and DOM structure on unknown sites

### `tab.getMarkdown(options?)`

Read the full page HTML and convert it to markdown.

This should hide converter-service and debugger details behind one agent-facing helper.

Useful for:

- documentation pages
- article summarization
- long-form content extraction

### `tab.screenshot(options?)`

Capture a screenshot of the current tab or page state.

Useful for:

- visual verification
- debugging web automation issues
- artifact generation

Expected option support may include:

- viewport vs full-page
- output path
- image format

### `tab.withDebugger(fn)`

Attach a debugger session to this tab, run a callback, and detach automatically.

This should be the safe default for CDP-heavy tasks.

### `tab.captureNetwork(fn, options?)`

Capture network activity around an action and return:

- a raw event stream
- request/response summaries
- convenience counts and aggregations

Expected options:

- `disableCache?`
- `clearExisting?`
- `includeRawEvents?`
- `settleMs?`

The callback-based form is important because network capture usually needs a boundary:

- navigate
- click
- submit form
- trigger fetch

Used in:

- GitHub homepage request analysis
- debugging app requests after user actions

### `tab.uploadFiles(selector, paths)`

Upload local files into a file input or compatible control.

This should exist because uploads are common and awkward enough to justify a helper-backed API.

Useful for:

- form submissions
- web apps with file attachments
- image/document upload workflows

## `WebDebuggerSession`

Represents an attached debugger/CDP context.

### `debuggerSession.cdp(method, params?)`

Raw CDP escape hatch.

Examples:

- `debuggerSession.cdp('Network.enable')`
- `debuggerSession.cdp('Page.navigate', { url })`
- `debuggerSession.cdp('Runtime.evaluate', { expression })`

This is necessary for advanced debugging and future-proofing.

### `debuggerSession.events(filter?)`

Return captured debugger events, optionally filtered by prefix.

Examples:

- `Network.`
- `Runtime.`
- `Log.`

### `debuggerSession.clearEvents(filter?)`

Clear captured events, either globally or by prefix.

Useful for:

- multi-phase captures in one session
- "capture only what happens after this click"

## Why DOM Actions Are Not First-Class In MVP

The current proposal intentionally does **not** make these methods part of the initial core public
API:

- `tab.inspect()`
- `tab.click()`
- `tab.type()`
- `tab.setValue()`
- `tab.press()`
- `tab.scroll()`

Reasoning:

- they are often site-specific rather than universally reliable
- if a selector is already known, `tab.evaluate()` can usually perform the action
- the hard part is usually readiness, targeting, and verification, not the mechanical action
- a generic version of these methods risks becoming brittle or misleading across modern web apps

Instead, the skill docs should teach these as patterns and recipes built on top of:

- `waitForLoad()`
- `waitFor()`
- `waitForIdle()`
- `evaluate()`

## Skill Teaching Strategy

The `web` skill should teach the agent a browser task algorithm, not just API signatures.

## Default Browser Task Algorithm

The skill should teach this loop:

1. Define the task goal.
2. Choose the execution mode:
   - read
   - interact
   - debug
   - browser management
   - download/upload
3. Open or reuse the right tab.
4. Wait for browser load.
5. Wait for app-specific readiness.
6. Probe the page with a small targeted `evaluate()` call.
7. Perform the smallest useful action.
8. Verify the outcome immediately.
9. Iterate if selectors, waits, or page state need refinement.
10. Keep the tab open only when the user asked for verification.

## What The Skill Should Teach

The overview skill doc should teach:

- when the `web` skill applies
- the high-level object model:
  - browser
  - tab
  - debugger
- the default browser task algorithm
- when to use raw Chrome APIs vs high-level helpers
- when to use debugger/network helpers
- which reference file to read next

## Proposed Skill Documentation Layout

```text
skills/web/
  SKILL.md
  references/
    read.md
    interact.md
    debug.md
    browser-state.md
    downloads.md
    recipes.md
```

### `SKILL.md`

Should include:

- when to use the `web` skill
- required reading order
- overview of the helper exports
- browser task algorithm
- which reference to read next

### `references/read.md`

Should teach:

- opening pages
- waiting for readiness
- extracting structured information with `evaluate()`
- when to use `getMarkdown()`
- how to summarize page content safely

Examples:

- reading docs pages
- summarizing visible feed items
- extracting tables, cards, or rows

### `references/interact.md`

Should teach:

- using `evaluate()` for page-specific actions
- setting values in controlled inputs
- filling contenteditable areas
- clicking through DOM logic when needed
- verifying state changes after actions

Examples:

- Gmail draft creation
- form interactions
- web app control flows

### `references/debug.md`

Should teach:

- `withDebugger()`
- `captureNetwork()`
- `cdp()`
- event collection and filtering
- how to analyze requests and responses

Examples:

- capturing GitHub homepage network activity
- debugging a user-triggered fetch
- collecting CDP domain events during a workflow

### `references/browser-state.md`

Should teach:

- listing tabs
- finding specific app tabs
- focusing tabs
- closing tabs selectively
- keeping a verification tab open

Examples:

- keeping only the Notion tab open
- reusing an existing Gmail tab

### `references/downloads.md`

Should teach:

- locating downloads
- waiting for downloads to complete
- verifying file presence and metadata
- upload workflows through `uploadFiles()`

### `references/recipes.md`

Should contain short task-oriented recipes such as:

- detect a login gate
- inspect an unknown page
- extract the first N visible items from a feed
- submit a form and verify success
- keep the tab open for user verification
- capture network only for one interaction

## Examples From Exploration Tasks

The design should explicitly support the workflows already validated during manual exploration.

### Reading site capabilities

Task:

- determine major actions possible on `docs.polymarket.com`

Pattern:

- open tab
- wait for load
- run small `evaluate()` probes for headings, links, and page text
- optionally use `getMarkdown()` for detailed content extraction

### Reading email summaries

Task:

- summarize the top 3 Gmail messages

Pattern:

- reuse or open Gmail tab
- wait for inbox row selector
- extract first visible rows with `evaluate()`
- verify login state vs inbox state

### Composing a draft

Task:

- create a Gmail draft

Pattern:

- navigate to compose
- wait for compose readiness
- use targeted `evaluate()` logic to fill fields
- verify field values
- optionally verify draft persistence

### Capturing network activity

Task:

- inspect requests triggered by `github.com`

Pattern:

- open temp tab
- `withDebugger()`
- enable network
- optionally disable cache
- navigate
- collect and summarize `Network.*` events

### Reading feed items

Task:

- read top posts on `x.com/home`

Pattern:

- open tab
- wait for article selector
- extract the first visible items
- leave tab open if user wants to verify

### Managing browser state

Task:

- close all tabs except Notion

Pattern:

- list tabs
- find Notion tab
- close everything else
- verify remaining tab list

## MVP Scope

The initial implementation should include:

- `connectWeb()`
- `withWebBrowser()`
- `WebBrowser.close()`
- `WebBrowser.openTab()`
- `WebBrowser.listTabs()`
- `WebBrowser.findTabs()`
- `WebBrowser.closeTabs()`
- `WebBrowser.closeOtherTabs()`
- `WebBrowser.chrome()`
- `WebBrowser.listDownloads()`
- `WebBrowser.waitForDownload()`
- `WebTab.info()`
- `WebTab.goto()`
- `WebTab.reload()`
- `WebTab.focus()`
- `WebTab.close()`
- `WebTab.waitForLoad()`
- `WebTab.waitFor()`
- `WebTab.waitForIdle()`
- `WebTab.evaluate()`
- `WebTab.getMarkdown()`
- `WebTab.screenshot()`
- `WebTab.withDebugger()`
- `WebTab.captureNetwork()`
- `WebTab.uploadFiles()`
- `WebDebuggerSession.cdp()`
- `WebDebuggerSession.events()`
- `WebDebuggerSession.clearEvents()`

## Future Features

These are intentionally deferred until there is repeated evidence that they are stable and useful.

### Possible Convenience DOM Helpers

- `tab.inspect()`
- `tab.click()`
- `tab.type()`
- `tab.setValue()`
- `tab.press()`
- `tab.scroll()`

These should only be promoted if they can provide real cross-site reliability beyond what
`evaluate()` already offers.

### Possible Higher-Level Browser Features

- console log capture helpers
- DOM snapshot helpers
- cookie/localStorage/sessionStorage helpers
- HAR-like export helpers
- file chooser orchestration beyond simple uploads
- download-to-path helpers
- popup and multi-window workflow helpers
- accessibility-tree capture helpers
- tracing/performance capture helpers

### Possible Agent Ergonomics

- reusable "probe unknown page" recipe helpers
- built-in verification/report helpers
- common extraction recipe templates inside the temp helper workspace

## Non-Goals

The `web` skill should not:

- replace the base filesystem/shell tools
- hide all browser details behind brittle site-specific abstractions
- require the agent to learn the extension package directly
- try to wrap every Chrome API as a dedicated method

## Implementation Notes For The Package

When added as a bundled skill:

1. Create `skills/web/` with overview-first docs and targeted references.
2. Add helper code under `src/helpers/web/`.
3. Re-export the helper APIs from:
   - `src/helpers/index.ts`
   - `src/index.ts`
4. Add a `skills/registry.json` entry with `helperProject`:

```json
{
  "name": "web",
  "description": "Use a managed browser helper to read pages, interact with web apps, inspect network activity, manage tabs, and handle downloads/uploads.",
  "helperProject": {
    "runtime": "typescript",
    "package": "@ank1015/llm-agents"
  }
}
```

5. Add tests for:
   - public exports
   - skill registry/doc alignment
   - lifecycle cleanup
   - tab helpers
   - debugger/network helpers
   - download helpers
   - temp workspace usability

## Summary

The `web` skill should make browser work feel as natural and logical to the agent as filesystem and
shell work already do in `@ank1015/llm-agents`.

The correct shape is:

- helper-backed
- browser/tab/debugger oriented
- low-level enough for unfamiliar sites
- explicit about waiting and verification
- centered on `evaluate()` for custom DOM work
- documented through recipes instead of brittle site-specific abstractions
