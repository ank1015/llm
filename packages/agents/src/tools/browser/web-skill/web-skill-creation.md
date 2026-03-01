# Web Skill Creation Guide

This file explains how to create new web skills for the browser REPL agent.

## Goal

A web skill should teach the agent how to execute repeatable tasks on a specific web app with minimal rediscovery of page structure.

The output of this process is:

- app-level skill index markdown
- task-level markdown files with reusable REPL code patterns
- prompt wiring so the agent reads skill files first

## Canonical Paths

- Skills root:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill`
- App skill folder pattern:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/<app-name>`
- Task files pattern:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/<app-name>/tasks/<task-name>.md`
- Research workspace pattern:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/temp-skills/<app-name>/temp-scripts`

## End-to-End Workflow

1. Define app scope and tasks.
2. Research page structure with temporary scripts.
3. Distill stable extraction/action patterns.
4. Write app skill markdown and task markdown files.
5. Update CLI prompt so the agent uses skill-first behavior.
6. Validate with real queries.
7. Commit and maintain.

## 1) Define App Scope And Tasks

Start from user intent, not UI elements.

For each candidate task, define:

- task name
- when to use
- required inputs
- optional filters
- expected output schema
- exclusion/risk rules

Prefer high-frequency and stable tasks first.

Good v1 tasks are usually:

- search/extract results
- filtered search
- pagination collection
- result opening by rank/domain

## 2) Research With Temporary Scripts

Create temp scripts under:

- `/Users/notacoder/Desktop/agents/llm/packages/agents/temp-skills/<app-name>/temp-scripts`

Research scripts should:

- create a fresh Chrome window
- instantiate `Window(windowId)`
- navigate to target pages
- run `window.observe(...)`
- run `window.evaluate(...)` probes for selector hit testing
- save artifacts (markdown/json/png)

Use this stage to answer:

- which selectors are stable across pages
- where sponsored/ad markers appear
- how pagination works
- how filter params map to URL query params

## 3) Distill Stable Patterns

Before writing skill files, lock these patterns:

- canonical URL builder for the task
- extraction selectors fallback list
- ad/sponsored detection heuristic
- dedupe logic for links
- pagination stop conditions

Keep patterns robust:

- prefer URL parameters over brittle UI clicks where possible
- include fallback selectors
- normalize output shape

## 4) Write Skill Markdown Files

## 4.1 App Skill Index File

Create:

- `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/<app-name>/<app-name>-skill.md`

Include:

- skill purpose
- absolute paths to task files
- how the agent should use the files
- statement that snippets are adaptable patterns, not rigid scripts

## 4.2 Task Files

Create task files under `tasks/`.

Each task file should include, in order:

- task title
- absolute path to that file
- URL scope where it works
- short purpose
- compatibility note
- JS snippet the agent can adapt and run

Task snippets should stay concise but complete.

## 4.3 Required Compatibility Rules For Snippets

Write snippets in plain JavaScript for REPL stability.

Avoid in task snippets:

- TypeScript type declarations
- optional chaining `?.`
- nullish coalescing `??`
- TS generics like `window.evaluate<T>(...)`

Use safe JS alternatives:

- explicit null checks
- `typeof` checks
- regular function signatures without type annotations

## 4.4 Recommended Snippet Shape

Each snippet should usually include:

- `EXTRACT_*` script string for `window.evaluate(...)`
- URL builder function
- top-level task function (`getXxx(...)`)
- normalized return payload
- one example invocation

## 5) Update Agent Prompt Wiring

Update:

- `/Users/notacoder/Desktop/agents/llm/packages/agents/src/repl-cli.ts`

Ensure all are present:

- `read` tool is loaded
- skills root path constant
- app skill absolute path constant(s)
- system prompt explains skill-first behavior
- system prompt tells agent to read app skill file, then task file(s), then adapt code
- system prompt includes plain-JS compatibility guidance

## 6) Validate End-To-End

Run:

```bash
cd /Users/notacoder/Desktop/agents/llm
pnpm --filter @ank1015/llm-agents typecheck
```

Manual runtime validation:

```bash
cd /Users/notacoder/Desktop/agents/llm/packages/agents
npx tsx src/repl-cli.ts
```

Use a real request that should trigger the new skill.

Confirm in logs:

- agent calls `read` on app skill file
- agent calls `read` on task file
- `repl` executes adapted snippet successfully

If failures occur, inspect latest transcript in:

- `/Users/notacoder/Desktop/agents/llm/packages/agents/sessions`

Look specifically at tool-call arguments to see the exact code sent to `repl`.

## 7) Maintenance And Iteration

When the site changes:

1. reproduce with a failing real query
2. capture new structure using temp scripts
3. patch selectors/heuristics in task files
4. keep output schema stable if possible
5. rerun validation

Keep task files lean:

- remove unused branches
- keep comments short and operational
- avoid duplicating large docs across files

## Task File Template

````md
# Task: <task-name>

File: `<absolute path>`
Works on URLs:

- `<url pattern 1>`
- `<url pattern 2>`

Use this snippet to teach <app/task behavior>.

Compatibility note:

- Keep adapted code in plain JavaScript for REPL stability.
- Avoid TypeScript type annotations, optional chaining (`?.`), and nullish coalescing (`??`) in adapted variants.

```js
// extraction script
// url builder
// task function
// return await taskFunction({...})
```
````

```

## Done Criteria

A new web skill is complete when:

- app index and task files exist at canonical paths
- snippets run successfully through `repl`
- prompt points to skill path and enforces skill-first behavior
- at least one real user query succeeds with the skill flow
```
