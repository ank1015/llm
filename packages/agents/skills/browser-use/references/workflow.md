# Workflow

This skill is script-first. Write task-specific TypeScript scripts in the generated `max-skills` workspace.

## Script Standard

Every non-trivial browser script should include:

- argument parsing and `--help`
- a deterministic log prefix
- bounded timeouts
- structured output files for larger runs
- explicit cleanup
- explicit `process.exit(0)` or `process.exit(1)`

Do not leave browser cleanup or process shutdown implicit.

## Output Placement

- Helper scripts: `max-skills/scripts/<artifact-name>/`
- Temp and intermediate files: `max-skills/scripts/<artifact-name>/tmp/`
- Final deliverables: artifact directory unless the user says otherwise

For larger jobs, persist at least:

- `summary.json`
- `results.json`

For batch work, `summary.json` should usually include:

- `startedAt`
- `finishedAt`
- `attempted`
- `succeeded`
- `failed`
- important output paths

## Probe-First Execution

Do not jump straight to the full run on UI-sensitive work.

1. Recon
   Read only what you need and identify risky assumptions.
2. Probe
   Write a small script that tests the riskiest assumption.
3. Small batch
   Run a few cases and inspect the outputs.
4. Full run
   Scale only after the probe and small batch are stable.
5. Audit
   Persist summaries and per-item diagnostics.

## Focus Stabilization

Before sensitive click, menu, clipboard, or gesture flows:

```ts
await chrome.call('windows.update', windowId, { focused: true });
await chrome.call('tabs.update', tabId, { active: true });
await chrome.call('debugger.sendCommand', { tabId, method: 'Page.bringToFront' });
```

Then verify focus if the task depends on it.

## Retry Guidance

Retry transient failures up to 2 times.

- Re-apply focus stabilization before retrying.
- Do not keep retrying structural failures like missing targets or wrong navigation.

Suggested failure reasons:

- `load_timeout`
- `focus_not_acquired`
- `target_not_found`
- `clipboard_empty`
- `permission_denied`
- `navigation_error`
- `runtime_eval_error`
- `unknown`

## Diagnostics

Do not let failures disappear into logs. Persist enough information to explain what happened.

For interaction-heavy tasks, capture things like:

- target id or URL
- current page URL
- what selector or label was used
- focus state before and after
- what was clicked or extracted
- any retry count
- failure reason

## Cleanup

Always detach debugger sessions you opened.

If the script creates throwaway tabs or windows, close them in `finally` blocks when practical.

Use this pattern consistently:

```ts
process.exit(0);
```

and

```ts
process.exit(1);
```

without relying on the process to exit naturally.
