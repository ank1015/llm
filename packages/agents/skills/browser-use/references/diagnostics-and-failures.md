# Diagnostics And Failures Placeholder

This file should eventually standardize how browser scripts describe success,
failure, retries, and evidence.

## Final Content This File Should Hold

- Failure classification vocabulary.
- Required diagnostic fields for each attempt.
- What goes in `summary.json` and `results.json`.
- Retry rules and when not to retry.

## What We Need To Learn First

- Which failure classes cover most real runs without being too vague.
- Which diagnostic fields are actually useful during debugging.
- What minimum logging keeps scripts understandable without producing noise.

## Experiments To Run Before Completing This File

- Intentionally trigger:
  - load timeout
  - target not found
  - focus instability
  - clipboard/readback failure
  - runtime evaluation failure
- Review the outputs and decide what was missing.
