#!/usr/bin/env node

/**
 * Placeholder for the first Google-specific browser script.
 *
 * This file is intentionally not implemented yet.
 *
 * Before writing the real version, we need to learn:
 * - which exact Google search task to support first
 * - whether URL-driven navigation is enough or UI interaction is required
 * - what output schema should be returned
 * - which query/filter combinations are stable enough to support
 * - what failure diagnostics are needed when page shape changes
 */

const HELP_TEXT = `Usage: node .max/skills/browser-use/sites/google/scripts/get-search.mjs [options]

Placeholder script. The real implementation should be written only after the
Google-specific experiments described in references/site-google.md are done.

Planned responsibilities:
- accept a query and optional search filters
- collect normalized search results
- emit deterministic JSON output
- log enough diagnostics to debug DOM or layout changes
`;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stdout.write(`${HELP_TEXT}\n`);
  process.exit(0);
}

process.stderr.write(
  'get-search.mjs is a placeholder. Complete references/site-google.md before implementing it.\n'
);
process.exit(1);
