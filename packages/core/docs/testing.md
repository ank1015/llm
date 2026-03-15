# Testing

`@ank1015/llm-core` uses a split test strategy:

- unit tests for fast deterministic coverage
- integration tests for live provider behavior

The package-local integration command is credential-aware. It only runs suites whose required credentials or local auth files are available, and it runs them sequentially to reduce provider flakiness and make failures easier to isolate.

## Commands

Run from the monorepo root:

```bash
pnpm --filter @ank1015/llm-core lint
pnpm --filter @ank1015/llm-core typecheck
pnpm --filter @ank1015/llm-core build
pnpm --filter @ank1015/llm-core test:unit
pnpm --filter @ank1015/llm-core test:integration
pnpm --filter @ank1015/llm-core test:coverage
```

Target a single integration suite when needed:

```bash
pnpm --filter @ank1015/llm-core exec vitest run tests/integration/cerebras/stream.test.ts
```

## Unit tests

Unit tests live under `tests/unit/` and cover:

- model utilities
- central dispatch (`llm/`)
- provider utilities and selected provider stream behavior
- event stream helpers
- validation, overflow detection, UUID, JSON parsing, and unicode sanitizing
- stateless agent runner helpers

These are the tests expected to run in normal CI for every change.

## Integration tests

Integration tests live under `tests/integration/` and call real provider services.

Current coverage includes:

- `anthropic`
- `claude-code`
- `openai`
- `codex`
- `google`
- `deepseek`
- `kimi`
- `zai`
- `cerebras`
- `openrouter`
- `minimax`
- `agent`

### Required credentials

| Area        | Required secret or local state                                                   |
| ----------- | -------------------------------------------------------------------------------- |
| Anthropic   | `ANTHROPIC_API_KEY`                                                              |
| Claude Code | `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_BETA_FLAG`, `CLAUDE_CODE_BILLING_HEADER` |
| OpenAI      | `OPENAI_API_KEY`                                                                 |
| Codex       | `~/.codex/auth.json` with access token and account id                            |
| Google      | `GEMINI_API_KEY`                                                                 |
| DeepSeek    | `DEEPSEEK_API_KEY`                                                               |
| Kimi        | `KIMI_API_KEY`                                                                   |
| Z.AI        | `ZAI_API_KEY`                                                                    |
| Cerebras    | `CEREBRAS_API_KEY`                                                               |
| OpenRouter  | `OPENROUTER_API_KEY`                                                             |
| MiniMax     | `MINIMAX_API_KEY`                                                                |

### CI vs local expectations

- `lint`, `typecheck`, `build`, and `test:unit` should be treated as the standard release-readiness baseline.
- `test:integration` should run only in a credentialed environment or during targeted release verification.
- `test:integration` intentionally skips suites that do not have the required credentials in the current environment.
- Image-generation integration coverage currently exists for `openai` and `google`.

## Known live-provider issues

Status: observed during OSS-prep validation on March 15, 2026.

### Cerebras stream flake

```bash
pnpm --filter @ank1015/llm-core exec vitest run tests/integration/cerebras/stream.test.ts
```

Observed once:

- test: `should emit done event at the end`
- file: `tests/integration/cerebras/stream.test.ts`
- expected last event type: `done`
- observed last event type: `error`

The failure was not deterministic. A later targeted rerun in the same environment passed.

### DeepSeek cross-provider handoff flake

Observed during a full sequential integration pass:

- test: `should handle cross-provider tool call and result handoff`
- file: `tests/integration/deepseek/complete.test.ts`
- observed failure: expected a response block, received `undefined`

That failure also did not reproduce deterministically. A targeted rerun of the same test passed immediately afterward.

### MiniMax stream delta flake

Observed during the package-local sequential integration run:

- test: `should emit text_delta with incremental text`
- file: `tests/integration/minimax/stream.test.ts`
- observed failure: expected at least one `text_delta` event, received none

That failure also did not reproduce deterministically. A targeted rerun of the same test passed immediately afterward.

This OSS-prep pass does not change provider runtime behavior for these issues. They are tracked as investigation items.
