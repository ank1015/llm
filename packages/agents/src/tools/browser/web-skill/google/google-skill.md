# Google Web Skill

Purpose: provide reusable code the agent can execute with `window.evaluate(...)` (plus small `window.open(...)` wrappers) to understand Google page structure and run search tasks without rediscovering DOM patterns from scratch.

## Task Files

- Normal search (`getSearchResults`), includes sponsored tagging and pagination:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/google/tasks/get-search-results.md`
- Advanced search (`getSearchResultsAdvanced`), includes advanced filters and time filtering:
  - `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/google/tasks/get-search-results-advanced.md`

## How To Use

1. Read the relevant task file to learn the extraction logic and selector strategy.
2. Reuse or customize the snippet for the current user request.
3. Apply the adapted code in the current browser workflow.

These snippets are templates for understanding and operating Google pages, not rigid one-shot scripts.
