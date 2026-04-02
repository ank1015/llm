# @ank1015/llm-agents

Private workspace package for the monorepo's filesystem tools, system prompts, and installable-skill registry helpers.

## Commands

```bash
pnpm --filter @ank1015/llm-agents build
pnpm --filter @ank1015/llm-agents typecheck
pnpm --filter @ank1015/llm-agents lint
pnpm --filter @ank1015/llm-agents test
pnpm --filter @ank1015/llm-agents test:unit
pnpm --filter @ank1015/llm-agents test:integration
pnpm --filter @ank1015/llm-agents test:coverage
```

## Module Map

- `src/index.ts` - package root exports for tool factories, prompt builders, and registry helpers
- `src/tools/` - read/write/edit/bash/search tool implementations and shared utilities
- `src/system-prompts/` - general assistant prompt plus compaction and checkpoint-summary prompts
- `src/skills/registry.ts` - installable skill registry loader and GitHub source parsing
- `src/skills/workspace.ts` - artifact-local `.max/skills` and `.max/temp` layout helpers
- `skills/registry.json` - remote skill catalog consumed by the registry loader
- `tests/unit/` - package-local unit coverage

## Conventions

- Keep this package workspace-only. Do not reintroduce publish or CLI-only workflows without a clear caller in the repo.
- Treat `skills/registry.json` as remote metadata, not as a bundled local skill payload.
- When changing prompt wording or registry behavior, update the relevant unit tests in the same change.
- Prefer deterministic tests for tools by injecting custom operations instead of relying on host binaries when possible.
