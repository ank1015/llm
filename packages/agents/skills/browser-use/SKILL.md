---
name: browser-use
description: Use this skill for web-related tasks that involve getting data from websites or doing things on websites in a real browser. This includes browsing pages, searching the web, clicking through flows, filling forms, logging in, handling dynamic JavaScript-rendered content, navigating tabs or windows, downloading files, taking screenshots, and interacting with content that depends on the live browser session.
---

# Browser Use

Use this skill when the job needs a live Chrome session instead of a static fetch or a one-shot file operation.

## What You Can Do With This Skill

- Open and manage real Chrome windows and tabs.
- Navigate through live sites, including logged-in or session-bound pages.
- Read DOM state from JavaScript-rendered pages.
- Click, type, submit forms, and work through multi-step browser flows.
- Capture screenshots, downloads, and browser-side behavior that only exists in the live session.
- Use Chrome DevTools Protocol methods for runtime evaluation, focus-sensitive behavior, and network capture.
- Read browser-level data like cookies, extension storage, downloads state, and subscribed browser events.

## Working Model

- `@ank1015/llm-extension` is already available in the generated `max-skills` workspace.
- Write authored scripts in `max-skills/scripts/<artifact-name>/`.
- Put temp and intermediate files in `max-skills/scripts/<artifact-name>/tmp/`.
- Write final user-facing outputs to the artifact directory unless the user asks for a different location.
- From the `max-skills` root, run scripts with `pnpm exec tsx scripts/<artifact-name>/<script>.ts`.
- Always end browser scripts with explicit `process.exit(0)` or `process.exit(1)` because open browser connections can keep Node alive.

## Read The Right File For The Task

- Read [references/runtime-model.md](references/runtime-model.md) when you need to understand what the SDK can do, which `chrome.call(...)` methods to use, or whether the task should use normal Chrome APIs or debugger methods.
- Read [references/workflow.md](references/workflow.md) when you are writing a non-trivial automation script, planning retries, scaling to batches, persisting diagnostics, or deciding how to structure outputs and cleanup.
- Read [references/cookbook.md](references/cookbook.md) when you want working TypeScript starting points for connect, wait-for-load, debugger attach/detach, runtime evaluate, screenshots, downloads, cookies, storage, subscriptions, retries, JSON output, or cleanup.
- Read the matching site guide below when the task clearly targets that site.

## Embedded Site Guides

Read these files directly when the task is site-specific:

- Google: `skills/browser-use/sites/google/INDEX.md`
- X: `skills/browser-use/sites/x/INDEX.md`

If the target site is not listed, use this base skill and the reference files above.

## Default Execution Flow

1. Write a small TypeScript script in `scripts/<artifact-name>/`.
2. Connect with `connect({ launch: true })`.
3. Use normal `chrome.call(...)` methods for standard browser APIs.
4. Use `debugger.evaluate` for one-off page reads and a debugger session for multi-step CDP work.
5. Probe the risky part of the workflow first.
6. Scale only after the probe works.
7. Persist outputs and diagnostics.
8. Clean up and exit explicitly.
