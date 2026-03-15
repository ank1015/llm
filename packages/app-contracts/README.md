# @ank1015/llm-app-contracts

Shared HTTP DTOs and TypeBox schemas for the app-facing boundary around `@ank1015/llm-server`.

## Purpose

This package is the explicit contract layer between:

- `@ank1015/llm-server`
- `@ank1015/llm-projects-app`
- `@ank1015/llm-native-app`

It defines the public request and response shapes for project, artifact, session, skill, and streaming APIs. It is intentionally separate from `@ank1015/llm-types`, which owns lower-level SDK/runtime contracts.

## Exports

- `common` — shared error envelopes, enums, and shallow SDK payload schemas
- `projects` — project DTOs and request/query schemas
- `artifacts` — artifact DTOs and request/query schemas
- `sessions` — session DTOs and request/query schemas
- `skills` — bundled/installable skill DTOs
- `streaming` — SSE payloads, live-run summaries, and stream conflict/cancel envelopes

## Notes

- Schemas use TypeBox.
- App-owned payloads are validated structurally.
- Embedded SDK payloads like `Message`, `MessageNode`, and `AgentEvent` are represented with shallow TypeBox schemas plus strong TypeScript types.
- This package does not ship fetch clients or base URL helpers.
