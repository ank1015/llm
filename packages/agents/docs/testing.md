# Testing

Package-local validation commands:

- `pnpm --filter @ank1015/llm-agents lint`
- `pnpm --filter @ank1015/llm-agents typecheck`
- `pnpm --filter @ank1015/llm-agents build`
- `pnpm --filter @ank1015/llm-agents test:unit`
- `pnpm --filter @ank1015/llm-agents test:integration`
- `pnpm --filter @ank1015/llm-agents test:coverage`
- `cd packages/agents && npm pack --dry-run`

## What The Tests Cover

Current tests validate:

- public package exports
- bundled skill registry/frontmatter alignment
- skill install/list/delete behavior
- helper-backed skill installation preparing `.max/temp/`
- the temp TypeScript workspace running a helper script through `tsx`
- bundled skill overview/reference docs staying in sync

## Packaging Expectations

The dry-run tarball should include:

- clean `dist/`
- `skills/ai-images/**`
- `skills/web/**`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`

The tarball should not include stale removed outputs such as:

- old browser automation artifacts
- old image helper paths under removed source locations
- removed CLI builds

## Release Readiness

Before publishing this package, confirm:

- docs and package metadata reflect the real public surface
- `dist/` is rebuilt from a clean state
- helper-backed temp-project behavior is still documented and tested
