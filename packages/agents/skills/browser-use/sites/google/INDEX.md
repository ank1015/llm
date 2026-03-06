# Google Site Guide

Read this file after `skills/browser-use/SKILL.md` when the task clearly targets Google pages.

## Trigger Conditions

Use this guide for work on Google search pages such as:

- web search result collection
- search result inspection
- multi-page SERP extraction
- Google page interaction where the task depends on the live browser session

## URL Scope

- `https://www.google.com/search`
- `https://www.google.<tld>/search`

## Current Scope

- There are no bundled Google task docs under `tasks/` yet.
- Use the base `browser-use` references to author a task-specific script.

## Notes For Google Work

- Prefer building search URLs with query parameters over brittle UI clicking when the task allows it.
- Expect regional and localization differences across Google domains.
- Distinguish sponsored results from organic results when the output depends on ranking quality.
- Normalize result items consistently when extracting search results.

## Suggested Output Shape

For SERP-style extraction, prefer normalized items such as:

- `title`
- `url`
- `snippet`
- `rank`
- `page`
- `sponsored`

If future Google task docs are added, read them from `skills/browser-use/sites/google/tasks/`.
