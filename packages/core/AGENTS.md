# @ank1015/llm-core

Stateless multi-provider LLM runtime. This package owns the model catalog, provider registry, runtime dispatch, provider implementations, and the stateless agent loop.

## Commands

- `pnpm --filter @ank1015/llm-core lint` - Run package-local ESLint
- `pnpm --filter @ank1015/llm-core typecheck` - Type-check without emitting
- `pnpm --filter @ank1015/llm-core build` - Clean and build `dist/`
- `pnpm --filter @ank1015/llm-core test` - Run unit and integration suites
- `pnpm --filter @ank1015/llm-core test:unit` - Run unit tests only
- `pnpm --filter @ank1015/llm-core test:integration` - Run eligible integration suites sequentially
- `pnpm --filter @ank1015/llm-core test:coverage` - Run unit tests with coverage

## Structure

```text
src/
  index.ts                  - Public barrel and provider side-effect wiring
  models/
    index.ts                - MODELS export and model utility re-exports
    utils.ts                - getModel, getModels, getProviders, calculateCost
    *.ts                    - Per-provider model catalogs
  llm/
    complete.ts             - complete() delegates to stream().result()
    stream.ts               - Central dispatcher via registry lookup
  agent/
    runner.ts               - Stateless agent loop
    utils.ts                - Message builders
    mock.ts                 - Mock assistant message generation
  providers/
    registry.ts             - Runtime provider registry
    utils/
      chat-completion-utils.ts
      chat-stream.ts        - Shared OpenAI chat-completions stream engine
    anthropic/              - Native Anthropic provider
    claude-code/            - Anthropic-backed proxy provider
    codex/                  - OpenAI Responses-backed proxy provider
    openai/                 - Native OpenAI provider
    google/                 - Native Google provider
    deepseek/               - Shared chat-completions provider
    kimi/                   - Shared chat-completions provider
    zai/                    - Shared chat-completions provider
    cerebras/               - Shared chat-completions provider
    openrouter/             - Shared chat-completions provider
    minimax/                - Anthropic-compatible provider
tests/
  unit/                     - Fast tests, no live API calls
  integration/              - Live provider tests with credentials
scripts/
  update-openrouter-models.mjs
docs/
  README.md
  architecture.md
  providers.md
  testing.md
```

## Provider families

1. Native SDK providers: `anthropic`, `openai`, `google`
2. Anthropic-wire providers: `minimax`, `claude-code`
3. Shared OpenAI chat-completions providers: `deepseek`, `kimi`, `zai`, `cerebras`, `openrouter`
4. OpenAI Responses proxy provider: `codex`

## Key concepts

### Self-registering providers

Each provider registers itself from `providers/<name>/index.ts`. The export list in `src/index.ts` is part of the runtime wiring, not just a barrel. If a provider is not exported there, it will not register automatically.

### Stream-first runtime

Every provider implements a stream function. `complete()` just consumes the stream and returns the final assistant message.

### Model catalog layout

Models are defined in `src/models/<provider>.ts` and assembled in `src/models/index.ts`. There is no generated `models.generated.ts` file in the current package layout.

### Cross-provider replay

Provider message builders accept normalized assistant content when replaying messages created by another provider. That shared message model is the bridge that keeps tool-use and mixed-provider conversations working.

## Adding a provider

See [ADDING_PROVIDER.md](./ADDING_PROVIDER.md) for the full checklist.

Quick summary:

- add provider contracts in `packages/types`
- implement `index.ts`, `stream.ts`, and `utils.ts` under `src/providers/<name>/`
- export the provider from `src/index.ts`
- import it in `vitest.setup.ts`
- add `src/models/<name>.ts`
- wire it into `src/models/index.ts`

## Boundaries

Never:

- set `sideEffects: false` for this package
- add provider runtime code without self-registration wiring
- add provider models without updating `src/models/index.ts`
- change shared contract shapes here when the source of truth lives in `packages/types`

Ask first:

- changing shared stream engines used by multiple providers
- changing cross-provider message conversion behavior
- changing build or publish surface
- adding new dependencies

Freely:

- add or improve tests
- tighten docs
- add new providers following the existing pattern
- fix package-local lint and type issues
