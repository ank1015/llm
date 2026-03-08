# Completing The Browser Skill

This document is the implementation order for the browser skill. Work in this
sequence so that later files depend on already-tested patterns rather than
guesses.

## Principles

- Do not try to complete every file in one pass.
- Only promote behavior into the skill after it works in repeated experiments.
- Prefer small, representative experiments over broad theory.
- When a pattern feels site-specific, prove that before putting it in a
  general-purpose reference.

## Step 1: Complete `references/sdk-core.md`

Goal:

- Define the stable primitives the agent should use most often.

What to do first:

- Re-read the extension package docs and tests.
- Confirm real signatures and return shapes for:
  - `connect`
  - `chrome.call`
  - `chrome.subscribe`
  - `chrome.getPageMarkdown`
  - `Window`
  - debugger special methods

Experiments needed:

- Run a few direct scripts against real pages to verify method behavior and
  common error shapes.

Exit criteria:

- This file names the small set of "blessed" APIs and explicitly says what not
  to reach for by default.

## Step 2: Complete `references/modes.md`

Goal:

- Teach the agent how to choose the right operating mode for a browser task.

What to do:

- Classify real tasks into:
  - read-only research
  - interactive webapp work
  - batch automation
  - state/debugging
  - site-specific shortcut

Experiments needed:

- Try at least one representative task in each category.
- Note where the first-chosen abstraction failed and what fallback worked.

Exit criteria:

- The file contains a clear selection table and fallback order.

## Step 3: Complete `scripts/lib/browser.mts`

Goal:

- Capture the common low-level helpers used by many scripts.

Likely contents:

- connect helper
- wait-for-load helper
- tab/window creation helpers
- focus stabilization helper

Experiments needed:

- Verify load waiting and focus stabilization across normal pages and at least
  one dynamic webapp.

Exit criteria:

- Reusable helpers exist and are proven by small standalone scripts.

## Step 4: Complete `scripts/lib/debugger.mts`

Goal:

- Centralize reliable debugger attach/detach and evaluate helpers.

Likely contents:

- guarded attach/detach helpers
- `Runtime.evaluate` wrapper
- event collection helpers

Experiments needed:

- Strict-CSP evaluation
- repeated attach/detach on same tab
- network event capture and cleanup

Exit criteria:

- Helpers hide the fragile debugger lifecycle and document failure modes.

## Step 5: Complete `scripts/lib/output.mts`

Goal:

- Standardize outputs and failure reporting for automation scripts.

Likely contents:

- summary writer
- results writer
- failure classification helpers
- artifact-path helpers

Experiments needed:

- Run several failing probes and verify the output still explains what happened.

Exit criteria:

- Scripts can emit deterministic `summary.json` and `results.json` without
  copy-pasting logic.

## Step 6: Complete `scripts/templates/browser-task.mts`

Goal:

- Create the default one-off low-level browser automation template.

Use for:

- raw `connect(...)` + `chrome.call(...)` tasks
- cookies, downloads, screenshots, markdown extraction, direct debugger work

Experiments needed:

- Validate CLI parsing, timeout handling, cleanup, and explicit process exit.

Exit criteria:

- A new low-level task can start from this template with minimal edits.

## Step 7: Complete `scripts/templates/window-task.mts`

Goal:

- Create the default template for `Window`-based interactive tasks.

Use for:

- observe/click/type/select flows
- page exploration inside a contained working window

Experiments needed:

- Verify observe-before-act workflow
- confirm useful logging around target ids and post-action results

Exit criteria:

- The template is the default starting point for interactive browser tasks.

## Step 8: Complete `scripts/templates/browser-batch-task.mts`

Goal:

- Create the default template for repetitive browser work over many inputs.

Use for:

- scraping runs
- many-item workflow automation
- checkpointed data collection

Experiments needed:

- small-batch then larger-batch runs
- retry behavior
- partial-failure handling

Exit criteria:

- The template makes batching, checkpoints, and diagnostics standard.

## Step 9: Complete `references/research-and-reading.md`

Goal:

- Document the preferred playbook for read-only page understanding and
  research.

Focus:

- when to use `chrome.getPageMarkdown(...)`
- when screenshots are needed
- pagination and multi-page collection
- read-only extraction without overusing `Window`

Experiments needed:

- long article
- strict-CSP page
- search results page
- page with lazy loading or pagination

Exit criteria:

- The file gives a reliable read-only workflow with concrete fallback rules.

## Step 10: Complete `references/webapp-flows.md`

Goal:

- Document how to handle real interactive web applications.

Focus:

- `Window.observe()`
- target ids
- clicking, typing, selecting, scrolling
- SPA navigation and modal handling
- fallback from action helpers to raw debugger logic

Experiments needed:

- form submit
- modal open/close
- dropdown/select
- infinite scroll or "load more"
- login-aware or session-sensitive page

Exit criteria:

- The file covers the common webapp patterns that the agent will actually hit.

## Step 11: Complete `references/state-and-debugging.md`

Goal:

- Teach the agent how to inspect and control browser state.

Focus:

- cookies
- `storage.local`
- downloads
- network capture
- debugger sessions

Experiments needed:

- cookie read/write/remove
- download completion and cleanup
- capture a real request/response body

Exit criteria:

- The file explains when state/debugging tools are better than DOM-level work.

## Step 12: Complete `references/diagnostics-and-failures.md`

Goal:

- Define the diagnostics contract used across scripts and playbooks.

Focus:

- failure reasons
- minimum fields per attempt
- retry policy
- what to log for success vs failure

Experiments needed:

- intentionally trigger representative failure classes and compare the logs.

Exit criteria:

- The file makes debugging failed automation runs materially easier.

## Step 13: Complete `references/pitfalls.md`

Goal:

- Capture the expensive mistakes so the agent avoids relearning them.

Focus:

- strict CSP
- focus instability
- stale observe snapshot assumptions
- brittle selectors
- dynamic content timing
- permission banners and session issues

Experiments needed:

- reproduce each pitfall at least once
- confirm the mitigation actually works

Exit criteria:

- Each pitfall entry includes both symptom and mitigation.

## Step 14: Complete `references/site-google.md`

Goal:

- Define what belongs in the first site-specific guide.

Focus:

- stable Google search URL patterns
- supported filters and variants
- result extraction shape
- when to use a script instead of generic browser reasoning

Experiments needed:

- top results collection
- pagination
- filters or tabs
- output normalization

Exit criteria:

- The file is specific enough to guide implementation of Google scripts.

## Step 15: Complete `sites/google/scripts/get-search.mjs`

Goal:

- Implement the first real site-specific script.

Scope for first version:

- one narrow, stable task
- clear CLI
- deterministic JSON output

Experiments needed:

- verify it works repeatedly with the same query shapes
- verify it fails clearly when page shape or policy changes

Exit criteria:

- The script solves one useful Google task end to end.

## Step 16: Return To `SKILL.md`

Goal:

- Write the actual top-level skill instructions after the underlying playbooks
  and helpers are proven.

What to include last:

- trigger description
- mode selection decision tree
- non-negotiable browser rules
- short routing map into the completed references

Exit criteria:

- `SKILL.md` becomes concise because the real detail already exists elsewhere.
