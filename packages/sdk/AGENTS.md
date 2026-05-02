# @ank1015/llm-sdk

Opinionated SDK package for gateway-backed `llm()` calls, simple path-first `image()` generation, stateful `agent()` runs, direct-key opt-out for chat models, and JSONL session helpers.

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

- `src/index.ts` - package root exports for `llm()`, `image()`, `agent()`, helpers, and shared types
- `src/image.ts` - path-first image generation/editing wrapper over the gateway
- `src/llm.ts` - one-off model-call wrapper over core streaming
- `src/agent.ts` - multi-turn agent runner with persisted session history
- `src/model-input.ts` - curated model IDs and provider-option resolution
- `src/config.ts` - default gateway/keys/session paths plus runtime overrides
- `src/gateway.ts` - gateway credentials, token refresh, SSE parsing, and proxy transport helpers
- `src/keys.ts` - keys-file parsing, credential lookup, and credential writers
- `src/session.ts` - JSONL session creation, traversal, and append helpers
- `src/messages.ts`, `src/response.ts`, `src/tool.ts` - authoring and response utilities
- `docs/` - package-facing consumer docs
- `skills/llm-sdk/`, `skills/image-gen/` - repo-local Codex skills for using this package from other agents
- `tests/unit/` - local unit coverage for helper behavior
- `tests/integration/` - live-provider integration coverage

## Conventions

- Keep sdk opinionated but predictable: curated `modelId` strings should map cleanly to gateway/core models and provider options. `openai/...` routes to the OpenAI provider; `azure-openai/...` routes to the Azure OpenAI provider.
- Treat `README.md`, `docs/`, and `CHANGELOG.md` as part of the public package surface.
- When adding provider support, update `model-input.ts`, keys-file docs, and tests together.
- Preserve the documented subpath exports for `config`, `keys`, and `session`; if they change, update the docs in the same change.
- Keep `skills/llm-sdk/` aligned with the published sdk docs when the developer-facing workflow changes.
