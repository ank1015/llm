# Task: getSearch

Script: `skills/browser-use/sites/google/scripts/get-search.ts`

Use this task whenever you need Google search results.

This task covers both:

- normal search via `--query`
- advanced search filters such as exact phrase, excluded words, site/domain, file type, language/region, terms location, numeric range, and relative time filters

## Default Behavior

- If `--tab-id` is not provided, the script creates a new tab and uses it for the whole run.
- If `--tab-id` is provided, the script reuses that tab and navigates it through the Google search pages.
- The script opens `https://www.google.com/advanced_search`, fills the real Google form, and submits it instead of navigating directly to a handcrafted search URL.
- The script prints formatted Markdown to stdout.
- The script does not print JSON to stdout.
- If `--json-output <path>` is provided, the script also writes structured JSON to that file.
- The returned output includes the working `tabId`, page metadata, and normalized search results.

## Run It

Run from the `max-skills` root:

```bash
pnpm exec tsx skills/browser-use/sites/google/scripts/get-search.ts --query "openai agents" --limit 10
```

## Required Search Input

Provide either:

- `--query <text>`

or at least one of:

- `--all-words <text>`
- `--exact-phrase <text>`
- `--any-words <text>`

You can also combine `--query` with advanced filters.

## Important Options

- `--tab-id <number>`: reuse an existing tab instead of creating a new one
- `--limit <number>`: total number of results to return; default `10`
- `--start <number>`: starting result offset; default `0`
- `--include-sponsored <true|false>`: include sponsored results; default `true`
- `--exclude-sponsored`: shorthand to force sponsored results off
- `--json-output <path>`: write structured JSON to a file
- `--timeout-ms <number>`: load/evaluate timeout per page; default `45000`

Advanced filter options:

- `--all-words <text>`
- `--exact-phrase <text>`
- `--any-words <text>`
- `--none-words <text>`
- `--site-or-domain <value>`
- `--file-type <value>`
- `--language <value>`
- `--region <value>`
- `--terms-appearing <value>`
- `--numbers-from <value>`
- `--numbers-to <value>`
- `--time-relative <d|w|m|y>`

## Output Shape

Stdout is Markdown. It includes:

- search summary
- working `tabId`
- requested vs returned counts
- pages visited
- one block per result with `title`, `url`, `source`, `date`, `description`, rank, and sponsored/organic type

If `--json-output` is set, the JSON file includes:

- `tabId`
- `mode`
- `searchSummary`
- `pages`
- `results`

Each result item includes:

- `title`
- `url`
- `source`
- `date`
- `description`
- `kind`
- `sponsored`
- `rankOnPage`
- `globalRank`
- `pageNumber`
- `pageStart`

## Example Commands

Simple search in a new tab:

```bash
pnpm exec tsx skills/browser-use/sites/google/scripts/get-search.ts --query "openai agents" --limit 10
```

Reuse an existing tab and save JSON diagnostics under the artifact temp folder:

```bash
pnpm exec tsx skills/browser-use/sites/google/scripts/get-search.ts --tab-id 812 --query "openai agents" --limit 20 --json-output scripts/product/tmp/google-search.json
```

Advanced search with time filter and site restriction:

```bash
pnpm exec tsx skills/browser-use/sites/google/scripts/get-search.ts \
  --all-words "openai agents" \
  --exact-phrase "reasoning model" \
  --site-or-domain github.com \
  --file-type pdf \
  --time-relative m \
  --limit 20 \
  --include-sponsored false
```
