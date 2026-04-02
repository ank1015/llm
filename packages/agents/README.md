# @ank1015/llm-agents

Private workspace package for the monorepo's filesystem tools, system prompt builders, and skill-registry helpers.

## What It Contains

- Tool factories for `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls`
- Prompt builders for the general assistant flow and the compaction/checkpoint helpers
- Remote skill-registry helpers used by the server to list installable skills

## Status

This package is workspace-only and is not intended to be published to npm.

There is currently no standalone CLI in this package. Use the exported APIs from other workspace packages instead of shell entrypoints here.

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

`test:integration` currently passes with no tests so the package-level `test` command remains green while the suite is still unit-heavy.

## Module Map

- `src/tools/` - filesystem, shell, search, and truncation utilities exposed as agent tools
- `src/system-prompts/` - general assistant, checkpoint summary, and compaction prompts
- `src/skills/registry.ts` - registry of installable skills and GitHub-source parsing
- `src/skills/workspace.ts` - artifact-local `.max/skills` workspace layout helpers
- `tests/unit/` - unit coverage for the registry, workspace layout, prompts, and tool behavior

## Notes

- The `skills/registry.json` file is a remote skill catalog, not a bundled local skill payload.
- Installed artifact skills live under `.max/skills` inside an artifact and are discovered there by name.
