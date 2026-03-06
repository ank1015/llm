# X Site Guide

Read this file after `skills/browser-use/SKILL.md` when the task clearly targets X.

## Trigger Conditions

Use this guide for work on X pages such as:

- home timeline collection
- profile inspection
- post extraction
- search timeline extraction
- authenticated browsing work that depends on the live X session

## URL Scope

- `https://x.com/home`
- `https://x.com/search`
- `https://x.com/<handle>`
- `https://x.com/<handle>/status/<id>`

## Current Scope

- There are no bundled X task docs under `tasks/` yet.
- Use the base `browser-use` references to author a task-specific script.

## Notes For X Work

- Expect login requirements for many flows.
- Timelines are virtualized, so scrolling and deduplication usually matter.
- Normalize entities by canonical post URL or post id when extracting posts.
- Be explicit about whether promoted posts, replies, reposts, or quotes should be included.

## Suggested Output Shape

For post or timeline extraction, prefer normalized fields such as:

- `postId`
- `url`
- `authorHandle`
- `authorName`
- `text`
- `createdAt`
- `promoted`
- `metrics`

If future X task docs are added, read them from `skills/browser-use/sites/x/tasks/`.
