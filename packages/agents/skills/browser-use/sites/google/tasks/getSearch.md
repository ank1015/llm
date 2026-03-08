# Task: getSearch

Script: `sites/google/scripts/get-search.mjs`

Use this task whenever you need Google search results from a live browser session.

## Default Behavior

- The script launches or connects to Chrome through `@ank1015/llm-extension`.
- It opens a Google search results page for the requested query.
- It waits for result cards to appear, extracts a normalized result list, and prints JSON to stdout.
- If `--json-output <path>` is provided, it also writes the JSON payload to that file.
- The script closes the throwaway tab it created before exiting.

## Run It

Run from the artifact root:

```bash
node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents" --limit 10
node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents" --limit 10 --json-output ".max/temp/browser-use/google-search.json"
```

## Required Input

- `--query <text>`

## Important Options

- `--limit <number>`: max number of results to return; default `10`
- `--json-output <path>`: write structured JSON to a file
- `--timeout-ms <number>`: max wait for result extraction; default `15000`

## Output Shape

Stdout is JSON:

```json
{
  "query": "openai agents",
  "url": "https://www.google.com/search?...",
  "resultCount": 10,
  "results": [
    {
      "title": "Example title",
      "url": "https://example.com",
      "snippet": "Example snippet"
    }
  ]
}
```

## Validation

- Check that `resultCount` is non-zero for a known-good query.
- If a file path was supplied, confirm the JSON file was written.
- If Google serves an interstitial, login wall, or region-specific variant that breaks extraction, fall back to a task-specific helper instead of retrying blindly.
