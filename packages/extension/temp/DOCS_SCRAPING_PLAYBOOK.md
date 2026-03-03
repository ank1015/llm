# Docs Scraping Playbook (Agent Runbook)

This runbook is for agents working in this repository with access to:

- `@ank1015/llm-extension` (`Window`, `connect`, Chrome RPC)
- The local scripts/tooling in `packages/extension/temp`
- A Chrome instance with the extension loaded

Goal:

- Export documentation pages from a docs website to local markdown files in URL-grouped folders.
- Prefer clean markdown via site-provided **Copy page** functionality.
- Fall back to `window.getPage(...)` when copy extraction is unavailable.

This is an iterative process, not a single brittle script.

## 1. Success Criteria

A scrape run is successful when all of the following are true:

- You have a deduplicated docs URL list (source of truth) for the target site.
- Each URL has an output markdown file in a deterministic folder path.
- Any failures are explicit in a summary report.
- Retry/fallback has been attempted for failures.
- Final count is known: total links, copied pages, fallback pages, unresolved pages.

## 2. Core Strategy

Use a phased approach:

1. Discover links.
2. Classify/filter links.
3. Probe one page for extraction method.
4. Run full export (copy-first).
5. Retry failures.
6. Fallback to `getPage` for remaining failures.
7. Verify final coverage.

Do not skip straight to full export.

## 3. Prerequisites Checklist

Before any run:

- Extension is built and loaded in Chrome (`dist/chrome`).
- Native host is working (Chrome RPC available).
- You can run a simple `Window` script and open a page.

If you changed `background.ts` or extension-side logic:

1. Rebuild: `pnpm --filter @ank1015/llm-extension build:chrome`
2. Reload extension in `chrome://extensions`

Without rebuild/reload, runtime behavior will not change.

## 4. Phase A: Discover All Candidate Docs URLs

Start from a docs root URL and crawl internal links.

What to collect from each page:

- Sidebar/nav links
- In-content links
- Any obvious docs index endpoints

Normalize links:

- Same origin only
- Strip hash (`#...`)
- Normalize trailing slash
- Skip static assets (`.png`, `.css`, `.js`, `.pdf`, etc)

Store output as plain text (`one URL per line`).

Recommended existing script template:

- `packages/extension/temp/inspect-polymarket-docs.ts`

Typical command pattern:

```bash
pnpm --filter @ank1015/llm-extension exec tsx temp/inspect-polymarket-docs.ts \
  --base-url <DOCS_ROOT_URL> \
  --max-pages 400
```

Important:

- Large `max-pages` avoids truncation.
- A completed crawl can still include non-doc links (login, repo, marketing).

## 5. Phase B: Filter to Real Docs URLs

Create a filtered URL list for export.

Common filters:

- Keep only paths under docs namespace (examples):
- `/docs/`
- `/docs/en/`
- Drop auth/login and external repo links.
- Keep canonical locale only if the site has multiple locales.

Output file recommendation:

- `temp/<site-name>/all-doc-links.txt`

This file is your stable input for export.

## 6. Phase C: Probe Extraction Method on 1 Page

Before full run, test a single page.

Order of attempts:

1. Copy-first path (menu + Copy page).
2. Capture clipboard payload.
3. If empty, inspect why.

Critical implementation details learned in practice:

- Copy may use `navigator.clipboard.write(ClipboardItem)` instead of `writeText`.
- You must capture both:
- `clipboard.writeText(...)`
- `clipboard.write(...)` and extract `text/plain` / `text/markdown` via `item.getType(...).text()`.
- Document focus matters. `document.hasFocus()` must be true for clipboard calls.

Focus stabilization techniques:

- Activate/focus window and tab (`windows.update`, `tabs.update`).
- Use CDP `Page.bringToFront` before copy actions.

Useful diagnostics to log per probe:

- `document.hasFocus()` before/after menu interactions
- Copy button labels seen
- Menu item clicked
- Clipboard/write events captured
- Captured length and preview

Recommended one-page test template:

- `packages/extension/temp/test-copy-one-doc.ts`

## 7. Phase D: Full Export (Copy-First)

Run exporter on full filtered URL list.

Behavior per URL:

1. Open page.
2. Force focus/bring-to-front.
3. Install clipboard hook.
4. Open copy menu and click best copy item.
5. Read captured markdown.
6. Write output markdown file.
7. Write debug artifact for that page.

Path mapping:

- URL path -> folder path + `.md`
- Example:
- `https://site/docs/en/setup` -> `docs/en/setup.md`

Recommendations:

- Retry each page at least 2 times.
- Keep per-page debug JSON under `_debug/`.
- Write `_summary.json` with full result list.

Recommended full exporter template:

- `packages/extension/temp/export-polymarket-docs.ts`

## 8. Phase E: Retry and Fallback for Failures

After copy-first run:

- Parse `_summary.json`.
- Build failure list.

For each failed URL:

1. Retry copy once or twice.
2. If still failing, use `window.getPage(url)`.
3. Save fallback markdown to the same target file path.
4. Mark fallback method in file header comment.

Recommended fallback template:

- `packages/extension/temp/fallback-getpage-for-failures.ts`

Notes:

- `getPage` output can include navigation/noise but usually preserves page text.
- This is acceptable as recovery path when copy is unavailable.

## 9. Verification Loop

At run end, verify:

- Count of exported `.md` files equals filtered URL count (or known exceptions).
- No unresolved failures remain (or they are documented clearly).
- Summary + fallback reports exist.

Useful checks:

```bash
# count files
find <output-dir> -type f -name '*.md' | wc -l

# inspect summary
cat <output-dir>/_summary.json

# inspect fallback report if used
cat <output-dir>/_fallback-report.json
```

## 10. Handling Common Failure Modes

### Failure: `No markdown copied from page`

Possible causes:

- Wrong menu/copy selector
- Page has no copy feature
- Clipboard hook misses `clipboard.write(...)`
- Copy succeeded but capture failed

Actions:

- Inspect debug JSON for candidate labels and focus state.
- Add/adjust selectors.
- Confirm interception of both `writeText` and `write`.
- Retry and then fallback to `getPage`.

### Failure: Clipboard error `Document is not focused`

Actions:

- Ensure window/tab active.
- Use `Page.bringToFront` via debugger session.
- Recheck `document.hasFocus()`.

### Failure after extension code changes but behavior unchanged

Actions:

1. Rebuild extension
2. Reload extension in Chrome
3. Re-run probe

### Failure: URL in link list is not a real doc page

Actions:

- Refine filter logic (`/docs/en/*` style constraints).
- Keep non-docs out of export input file.

## 11. Site Adaptation Checklist (New Website)

For a new docs domain, adapt only these pieces first:

- Crawl root URL
- Link filter rule for valid docs paths
- Copy menu selectors and menu-item matching
- Optional locale scoping

Keep these constants from this playbook:

- Two-pass method: copy-first then fallback
- URL-based file path mapping
- Per-page debug artifacts
- Final summary report

## 12. Practical Command Sequence (Generic)

1. Discover links:

```bash
pnpm --filter @ank1015/llm-extension exec tsx temp/inspect-polymarket-docs.ts \
  --base-url <docs-root> \
  --max-pages 400
```

2. Create filtered links file:

- Write to: `temp/<site>/all-doc-links.txt`

3. One-page probe:

```bash
pnpm --filter @ank1015/llm-extension exec tsx temp/test-copy-one-doc.ts --url <one-doc-url>
```

4. Full export:

```bash
pnpm --filter @ank1015/llm-extension exec tsx temp/export-polymarket-docs.ts \
  --links-file temp/<site>/all-doc-links.txt \
  --output-dir temp/<site>/markdown-by-url
```

5. Fallback repair:

```bash
pnpm --filter @ank1015/llm-extension exec tsx temp/fallback-getpage-for-failures.ts \
  temp/<site>/markdown-by-url/_summary.json
```

6. Final verify:

```bash
find temp/<site>/markdown-by-url -type f -name '*.md' | wc -l
```

## 13. Output Conventions

Recommended output structure:

- `temp/<site>/all-doc-links.txt`
- `temp/<site>/markdown-by-url/**/*.md`
- `temp/<site>/markdown-by-url/_summary.json`
- `temp/<site>/markdown-by-url/_debug/**/*.json`
- `temp/<site>/markdown-by-url/_fallback-report.json` (if fallback run used)

Each markdown file header should include:

- Source URL
- Capture timestamp
- Method (`copy` or `getPage fallback`)

## 14. What Makes This Robust

This process is robust because it assumes variation and failure:

- It does not assume every page has a copy button.
- It does not assume copy behavior is uniform across pages.
- It includes deterministic retries and explicit fallback.
- It logs enough diagnostics to debug selector/focus issues quickly.
- It separates discovery from extraction, so reruns are cheap.

Use this as the default approach for any docs scraping task unless the site provides a direct stable markdown endpoint.
