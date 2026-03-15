---
name: browser-use
description: 'Use this skill for live-browser work in Chrome: reading real pages, interacting with webapps, inspecting downloads/cookies/storage/network state, or running repeated browser automation through the Chrome RPC bridge.'
compatibility: 'Requires Chrome with the @ank1015/llm-extension native host installed. Read-only page extraction can also use a local HTML-to-markdown service at http://localhost:8080/convert.'
---

# Browser Use

Use this skill for live-browser tasks through the Chrome RPC bridge.

The browser package is now RPC-first:

- `connect(...)`
- `chrome.call(...)`
- `chrome.subscribe(...)`
- `chrome.getPageMarkdown(...)`
- debugger helper methods such as `debugger.evaluate`

There is no higher-level browser automation wrapper anymore.

## Required Reading Order

After reading this file, always do this exact sequence:

1. read [references/sdk-core.md](references/sdk-core.md)
2. read [references/modes.md](references/modes.md)
3. choose exactly one deeper reference for the current task

Do not skip `sdk-core.md` or `modes.md`.
Do not read multiple mode references up front unless you later switch modes.

## When To Use This Skill

Use this skill when the task depends on the real browser session rather than a static HTTP fetch. Typical cases:

- reading the current contents of a live page
- clicking through a webapp with low-level RPC calls
- inspecting browser state such as cookies, storage, downloads, or requests
- collecting data across many items or pages
- using a supported site shortcut instead of manual page reasoning

## Choose The First Path

- if a matching site shortcut exists, use it first:
  [references/site-google.md](references/site-google.md)
- if you need read-only extraction or page understanding, use:
  [references/research-and-reading.md](references/research-and-reading.md)
- if you need interactive UI work, use:
  [references/webapp-flows.md](references/webapp-flows.md)
- if the task is really about cookies, downloads, storage, network capture, or debugger sessions, use:
  [references/state-and-debugging.md](references/state-and-debugging.md)
- if the work repeats across many items or pages, use:
  [references/batch-automation.md](references/batch-automation.md)
- if behavior is confusing or brittle, check:
  [references/pitfalls.md](references/pitfalls.md)

## Non-Negotiable Rules

- the skill docs are the primary source of truth for browser-use tasks
- always read `sdk-core.md`, then `modes.md`, then one chosen deeper reference
- prefer the highest-leverage low-level RPC path that fits the task
- use a site script before manual page reasoning when a matching script exists
- use `chrome.getPageMarkdown(...)` first for read-only work when the converter is available
- use raw RPC plus `debugger.evaluate` for interactive UI flows
- prefer `debugger.evaluate` over `scripting.executeScript` when exact page JS execution matters
- save screenshots to files and inspect them with the image-reading tool when visual evidence matters
- probe before scaling batch work
- detach debugger sessions and clean up artifacts you created
- keep bundled skill files unchanged unless the user explicitly asks to modify them
- do not inspect `node_modules`, package `README.md`, `src/`, or `dist/` unless the skill docs are insufficient or you are debugging an export or runtime problem

## Reference Map

- core SDK primitives:
  [references/sdk-core.md](references/sdk-core.md)
- task mode selection:
  [references/modes.md](references/modes.md)
- read-only page work:
  [references/research-and-reading.md](references/research-and-reading.md)
- interactive webapp flows through raw RPC:
  [references/webapp-flows.md](references/webapp-flows.md)
- cookies, downloads, storage, and debugger sessions:
  [references/state-and-debugging.md](references/state-and-debugging.md)
- repeated browser automation:
  [references/batch-automation.md](references/batch-automation.md)
- failure patterns and expensive mistakes:
  [references/pitfalls.md](references/pitfalls.md)
- Google search shortcut:
  [references/site-google.md](references/site-google.md)
