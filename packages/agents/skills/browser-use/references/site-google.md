# Google Search

Use this site pack when the task is "get Google web search results" and the
normal output should be a clean Markdown summary plus optional structured JSON.
Prefer running the script. Do not inspect or reimplement it unless you are
debugging a failure or extending its scope.

## Run First

```bash
node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents" --limit 10
```

The script connects with `connect({ launch: true })`, opens Google Advanced
Search, fills the real form, submits it, paginates through result pages, and
prints normalized results to stdout.

If Google shows a manual verification page such as "I'm not a robot", the
script pauses, waits for the user to complete it in the browser, and then
continues automatically.

## Use This Script When

- you need standard Google web search results
- you need query filters such as exact phrase, excluded words, site/domain, file
  type, language, region, numeric range, or relative time
- you want normalized results instead of manually reading the SERP
- you want to reuse an existing tab with `--tab-id`
- you want a JSON artifact with `--json-output`

## Do Not Use This Script When

- the task is not standard Google web search, such as Images, Maps, News,
  Shopping, Gmail, Drive, or account settings
- the task requires custom interaction on the results page after extraction
- Google returns a consent page or hard blocked flow that the script cannot
  continue past
- the requested behavior falls outside the supported CLI options

If the script does not fit, fall back to the generic browser modes in
[modes.md](modes.md).

## Required Search Input

Provide either:

- `--query <text>`

or at least one of:

- `--all-words <text>`
- `--exact-phrase <text>`
- `--any-words <text>`

You can combine `--query` with advanced filters.

## CLI Options

| Option                              | Meaning                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `--help`, `-h`                      | Show help and exit `0`.                                         |
| `--query <text>`                    | Main query text.                                                |
| `--all-words <text>`                | Words that must all appear.                                     |
| `--exact-phrase <text>`             | Exact phrase constraint.                                        |
| `--any-words <text>`                | At least one of these words should appear.                      |
| `--none-words <text>`               | Excluded words.                                                 |
| `--numbers-from <value>`            | Lower numeric bound.                                            |
| `--numbers-to <value>`              | Upper numeric bound.                                            |
| `--language <value>`                | Google `lr` language value.                                     |
| `--region <value>`                  | Google `cr` region value.                                       |
| `--site-or-domain <value>`          | Restrict results to a site or domain.                           |
| `--terms-appearing <value>`         | Google `as_occt` terms location filter.                         |
| `--file-type <value>`               | Restrict by file type.                                          |
| `--time-relative <d\|w\|m\|y>`      | Relative time filter. Only `d`, `w`, `m`, `y` are valid.        |
| `--limit <number>`                  | Total results to return. Default `10`.                          |
| `--start <number>`                  | Starting result offset. Default `0`.                            |
| `--include-sponsored <true\|false>` | Whether sponsored results are kept. Default `true`.             |
| `--exclude-sponsored`               | Shorthand to force sponsored results off.                       |
| `--tab-id <number>`                 | Reuse an existing tab instead of creating a new one.            |
| `--timeout-ms <number>`             | Per-page timeout. Default `45000`.                              |
| `--json-output <path>`              | Write structured JSON to a file in addition to stdout Markdown. |

## Output

Stdout is always Markdown. It includes:

- working `tabId`
- search mode and search summary
- requested and returned counts
- pages visited
- final URL
- one normalized block per result

If `--json-output <path>` is provided, the script also writes a JSON artifact.
That JSON contains run metadata plus normalized result items. Use the JSON file
when another script needs machine-readable output. Use stdout when the agent
needs a human-readable summary.

## Exit Behavior

- exit `0` on success or `--help`
- non-zero exit on invalid arguments
- non-zero exit when Google returns a blocked or consent page
- non-zero exit when extraction fails or the results page shape is unusable

Common failure cases:

- missing query input
- invalid `--time-relative`
- Google consent gate
- hard Google block pages such as `403`
- result page loaded but no result items were extractable

Manual verification behavior:

- if Google shows a robot-check or unusual-traffic verification page, the
  script waits for the user to complete it instead of failing immediately
- when running through a shell tool, use a generous shell timeout because the
  script may pause while waiting for manual completion

## Examples

Simple search in a new tab:

```bash
node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents" --limit 10
```

Reuse an existing tab and save JSON:

```bash
node .max/skills/browser-use/sites/google/scripts/get-search.mjs \
  --tab-id 812 \
  --query "openai agents" \
  --limit 20 \
  --json-output /tmp/google-search.json
```

Advanced filters with site restriction and relative time:

```bash
node .max/skills/browser-use/sites/google/scripts/get-search.mjs \
  --all-words "openai agents" \
  --exact-phrase "reasoning model" \
  --site-or-domain github.com \
  --time-relative m \
  --limit 20 \
  --exclude-sponsored
```

## Fallback Rule

Run this script first for Google result collection. If it returns a blocked
page, a consent flow, or the task is outside its CLI surface, stop using the
Google shortcut and move back to the generic browser guidance in
[research-and-reading.md](research-and-reading.md),
[webapp-flows.md](webapp-flows.md),
or
[state-and-debugging.md](state-and-debugging.md).
