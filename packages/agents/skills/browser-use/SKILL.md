---
name: browser-use
description: Use this skill for web-related tasks that involve getting data from websites or doing things on websites in a real browser. This includes browsing pages, searching the web, clicking through flows, filling forms, logging in, handling dynamic JavaScript-rendered content, navigating tabs or windows, downloading files, taking screenshots, and interacting with content that depends on the live browser session.
compatibility: Requires Node.js, Chrome, and a working @ank1015/llm-extension native-host setup.
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

- This skill is installed inside the artifact at `.max/skills/browser-use/`.
- Relative paths in this skill are relative to the skill directory.
- Temporary helper files for this artifact should go under `<artifactDir>/.max/temp/browser-use/`.
- Final user-facing outputs should stay in the artifact directory unless the user asks for a different location.
- Prefer bundled scripts first. If the task needs an extra throwaway helper, keep it ephemeral under `<artifactDir>/.max/temp/browser-use/`.
- All browser scripts must be non-interactive and should end with explicit `process.exit(0)` or `process.exit(1)`.

## Read The Right File For The Task

- Read [references/runtime-model.md](references/runtime-model.md) when you need to understand what the SDK can do, which `chrome.call(...)` methods to use, or whether the task should use normal Chrome APIs or debugger methods.
- Read [references/workflow.md](references/workflow.md) when you are writing a non-trivial automation script, planning retries, scaling to batches, persisting diagnostics, or deciding how to structure outputs and cleanup.
- Read [references/cookbook.md](references/cookbook.md) when you want working starting points for connect, wait-for-load, debugger attach/detach, runtime evaluate, screenshots, downloads, cookies, storage, subscriptions, retries, JSON output, or cleanup.
- Read the matching site guide when the task clearly targets that site.

## Embedded Site Guides

Read these files directly when the task is site-specific:

- Google: `sites/google/INDEX.md`
- X: `sites/x/INDEX.md`

If the target site is not listed, use this base skill and the reference files above.
If a site guide includes a bundled task doc and script, prefer that script before writing a new helper.

## Bundled Executable

Google search extraction is bundled as:

- `sites/google/scripts/get-search.mjs`

Run it from the artifact root:

```bash
node .max/skills/browser-use/sites/google/scripts/get-search.mjs --help
node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents" --json-output ".max/temp/browser-use/google-search.json"
```

## Default Execution Flow

1. Use a bundled script if one already fits the task.
2. Probe the risky part of the workflow first.
3. Scale only after the probe works.
4. Persist outputs and diagnostics.
5. Clean up tabs or debugger sessions you created.
