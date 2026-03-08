---
name: browser-use
description: 'Use this skill for web-related tasks that involve getting data from websites or doing things on websites in a real browser. This includes browsing pages, searching the web, clicking through flows, filling forms, logging in, handling dynamic JavaScript-rendered content, navigating tabs or windows, downloading files, taking screenshots, and interacting with content that depends on the live browser session.'
compatibility: 'Requires Chrome with the @ank1015/llm-extension native host installed. Some read-only page extraction workflows also require the local HTML-to-markdown service at http://localhost:8080/convert.'
---

# Browser Use

Use this skill for live-browser tasks in Chrome: reading current pages,
clicking through webapps, inspecting cookies or downloads or network behavior,
running repeated browser automation, or using site-specific shortcuts such as
Google search.

## When To Use This Skill

Use this skill when the task depends on the real browser session rather than a
static HTTP fetch. Typical cases:

- reading the current contents of a live page
- interacting with a webapp through clicks, typing, scrolling, or form flows
- inspecting browser state such as cookies, storage, downloads, or requests
- collecting data across many items or pages
- using a supported site shortcut instead of manual page reasoning

## Choose The First Path

- if a matching site shortcut exists, use it first:
  [references/site-google.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/site-google.md)
- if you need read-only extraction or page understanding, use:
  [references/research-and-reading.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/research-and-reading.md)
- if you need interactive UI work with `Window`, use:
  [references/webapp-flows.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/webapp-flows.md)
- if the task is really about cookies, downloads, storage, network capture, or
  debugger sessions, use:
  [references/state-and-debugging.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/state-and-debugging.md)
- if the work repeats across many items or pages, use:
  [references/batch-automation.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/batch-automation.md)
- if behavior is confusing or brittle, check:
  [references/pitfalls.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/pitfalls.md)

If you need to refresh the core SDK surface before choosing a mode, read:
[references/sdk-core.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/sdk-core.md)

## Non-Negotiable Rules

- prefer the highest-level deterministic path that fits the task
- use a site script before manual page reasoning when a matching script exists
- use `chrome.getPageMarkdown(...)` first for read-only work
- use `Window` for interactive UI flows, and observe before acting
- prefer `debugger.evaluate` over `scripting.executeScript` when exact page JS
  execution matters
- save screenshots to files and inspect them with the image-reading tool when
  visual evidence matters
- probe before scaling batch work
- detach debugger sessions and clean up artifacts you created

## Reference Map

- task mode selection:
  [references/modes.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/modes.md)
- core SDK primitives:
  [references/sdk-core.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/sdk-core.md)
- read-only page work:
  [references/research-and-reading.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/research-and-reading.md)
- interactive `Window` flows:
  [references/webapp-flows.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/webapp-flows.md)
- cookies, downloads, storage, and debugger sessions:
  [references/state-and-debugging.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/state-and-debugging.md)
- repeated browser automation:
  [references/batch-automation.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/batch-automation.md)
- failure patterns and expensive mistakes:
  [references/pitfalls.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/pitfalls.md)
- Google search shortcut:
  [references/site-google.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/browser-use/references/site-google.md)
