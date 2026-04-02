# @ank1015/llm-sdk

Opinionated SDK package for credential-backed `llm()` calls, stateful `agent()` runs, and JSONL session helpers.

## Commands

```bash
pnpm --filter @ank1015/llm-sdk build
pnpm --filter @ank1015/llm-sdk typecheck
pnpm --filter @ank1015/llm-sdk lint
pnpm --filter @ank1015/llm-sdk test:unit
pnpm --filter @ank1015/llm-sdk test:coverage
pnpm --filter @ank1015/llm-sdk test:integration
pnpm --filter @ank1015/llm-sdk release:check
```

## Module Map

- `src/index.ts` - package root exports for `llm()`, `agent()`, helpers, and shared types
- `src/llm.ts` - one-off model-call wrapper over core streaming
- `src/agent.ts` - multi-turn agent runner with persisted session history
- `src/model-input.ts` - curated model IDs and provider-option resolution
- `src/config.ts` - default keys/session paths plus runtime overrides
- `src/keys.ts` - keys-file parsing, credential lookup, and credential writers
- `src/session.ts` - JSONL session creation, traversal, and append helpers
- `src/messages.ts`, `src/response.ts`, `src/tool.ts` - authoring and response utilities
- `docs/` - package-facing consumer docs
- `tests/unit/` - local unit coverage for helper behavior
- `tests/integration/` - live-provider integration coverage

## Conventions

- Keep sdk opinionated but predictable: curated `modelId` strings should map cleanly to core models and provider credentials.
- Treat `README.md`, `docs/`, and `CHANGELOG.md` as part of the public package surface.
- When adding provider support, update `model-input.ts`, keys-file docs, and tests together.
- Preserve the documented subpath exports for `config`, `keys`, and `session`; if they change, update the docs in the same change.
