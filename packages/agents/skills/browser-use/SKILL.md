---
name: browser-use
description: 'Use this skill for web-related tasks that involve getting data from websites or doing things on websites in a real browser. This includes browsing pages, searching the web, clicking through flows, filling forms, logging in, handling dynamic JavaScript-rendered content, navigating tabs or windows, downloading files, taking screenshots, and interacting with content that depends on the live browser session.'
compatibility: 'Requires Chrome with the @ank1015/llm-extension native host installed. Some read-only page extraction workflows also require the local HTML-to-markdown service at http://localhost:8080/convert.'
---

# Browser Use

This skill is intentionally incomplete.

Its purpose right now is to define the final structure of the browser skill and
to make the remaining implementation work explicit. The real operational
guidance should only be written after we validate it through hands-on browser
experiments.

## What This File Should Eventually Contain

- A concise trigger rule for when the agent should load this skill.
- A decision tree for choosing among:
  - site-specific scripts
  - `chrome.getPageMarkdown(...)`
  - `Window`
  - low-level `connect(...)` + `chrome.call(...)`
- A short list of non-negotiable operating rules for browser work:
  - probe before scale
  - prefer deterministic paths
  - log enough diagnostics to explain failures
  - always clean up debugger sessions and long-running scripts
- A short routing map into the reference files in `references/`.

## What We Need To Learn Before Writing The Real Version

- Which browser tasks are reliably solved by `chrome.getPageMarkdown(...)`
  without any `Window` usage.
- Where `Window.observe()` and action helpers are reliable, and where they need
  raw debugger or raw Chrome API fallbacks.
- Which repeated tasks deserve site-specific scripts instead of generic page
  understanding.
- What minimum diagnostics are enough for retrying and debugging failed runs.
- Which rules are universal across sites, and which rules only apply to a
  narrow subset of tasks.

## Files To Complete Later

- [references/modes.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/modes.md)
- [references/sdk-core.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/sdk-core.md)
- [references/research-and-reading.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/research-and-reading.md)
- [references/webapp-flows.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/webapp-flows.md)
- [references/batch-automation.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/batch-automation.md)
- [references/state-and-debugging.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/state-and-debugging.md)
- [references/diagnostics-and-failures.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/diagnostics-and-failures.md)
- [references/pitfalls.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/pitfalls.md)
- [references/site-google.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/site-google.md)
- [scripts/templates/browser-task.mts](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/scripts/templates/browser-task.mts)
- [scripts/templates/browser-batch-task.mts](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/scripts/templates/browser-batch-task.mts)
- [scripts/templates/window-task.mts](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/scripts/templates/window-task.mts)
- [scripts/lib/browser.mts](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/scripts/lib/browser.mts)
- [scripts/lib/debugger.mts](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/scripts/lib/debugger.mts)
- [scripts/lib/output.mts](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/scripts/lib/output.mts)
- [sites/google/scripts/get-search.mjs](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/sites/google/scripts/get-search.mjs)
- [completing-browser-skill.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/completing-browser-skill.md)

## Completion Order

Follow [completing-browser-skill.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/completing-browser-skill.md) when turning this scaffold into a real skill.
