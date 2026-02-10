# @ank1015/llm-research

Research utilities for LLM SDK.

## Commands

```bash
pnpm build        # Build the package
pnpm dev          # Build in watch mode
pnpm test         # Run all tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # Type-check without emitting
pnpm clean        # Remove build artifacts
```

## Structure

```
src/
  index.ts          # Public exports
tests/
  unit/             # Unit tests
  integration/      # Integration tests
```

## Conventions

- Follow root AGENTS.md and CLAUDE.md conventions
- Export all public APIs from `src/index.ts`
- Colocate unit tests as `*.test.ts` next to source files
- Place integration tests in `tests/integration/`

## Dependencies

- Depends on: (none yet)
- Depended on by: (none yet)
