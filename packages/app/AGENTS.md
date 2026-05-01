# @ank1015/llm

Publishable CLI package that launches the local LLM runtime app through `npx`.

## Commands

```bash
pnpm --filter @ank1015/llm build # Compile CLI and assemble web artifacts
pnpm --filter @ank1015/llm smoke # Start assembled app and verify health
pnpm --filter @ank1015/llm pack  # Create npm tarball
```

## Packaging

- `dist/` contains the CLI entrypoint.
- `vendor/web/` contains the standalone Next.js production build copied from `apps/web`.
- The Hono backend is installed through the `@ank1015/llm-server` dependency so native runtime dependencies are installed by npm for the target platform.

Keep this package focused on release assembly and runtime launching. Source app changes belong in `packages/server` and `apps/web`.
