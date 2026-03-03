# X Web Skill

Purpose: provide reusable code the agent can execute with `window.evaluate(...)` (plus small `window.open(...)` wrappers) to extract X/Twitter data reliably from virtualized timelines without rediscovering DOM behavior each run.

## Task Files

- Home feed extraction with natural scrolling and dedupe:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-home-feed-posts.md`
- Bookmarks timeline extraction:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-bookmark-posts.md`
- Profile metadata extraction:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-profile.md`
- Individual post extraction by canonical status URL:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-post.md`
- Profile timeline extraction (posts/replies/media):
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-profile-posts.md`
- Search timeline extraction (latest/top):
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-search-posts.md`
- Advanced search timeline extraction (query operators/filters in `q=`):
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-advanced-search-posts.md`

## How To Use

1. Read the relevant task file first to load selectors, extraction logic, and scroll strategy.
2. Adapt the snippet for the user request (mode, count, promoted filtering, stop conditions).
3. Execute the adapted code in `repl` and return normalized output.

## REPL Guardrails

- Keep extraction scripts in `String.raw\`...\``constants when passing them to`window.evaluate(...)`.
- If you use normal template literals for nested script strings, regex backslashes must be double-escaped (`\\s`, `\\d`, `\\/`), otherwise the injected script may fail with parse errors like `Unexpected token '^'`.
- Prefer reusing task snippet constants (`EXTRACT_*`, `STATE_*`) instead of rewriting large inline evaluate strings.

These snippets are templates for understanding and operating X pages, not rigid one-shot scripts.
