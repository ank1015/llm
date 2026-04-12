# @ank1015/llm-core

Stateless runtime package for chat/image/music/video model catalogs, provider dispatch, normalized message/event contracts, and the shared agent engine.

## Commands

```bash
pnpm --filter @ank1015/llm-core build
pnpm --filter @ank1015/llm-core typecheck
pnpm --filter @ank1015/llm-core lint
pnpm --filter @ank1015/llm-core test:unit
pnpm --filter @ank1015/llm-core test:coverage
pnpm --filter @ank1015/llm-core test:integration
pnpm --filter @ank1015/llm-core release:check
```

## Module Map

- `src/index.ts` - package root exports and built-in provider registration side effects
- `src/images/` - dedicated image generation runtime, model catalogs, and image provider registry
- `src/music/` - dedicated music generation runtime, model catalogs, and music provider registry
- `src/videos/` - dedicated video generation runtime, model catalogs, and video provider registry
- `src/llm/` - generic `stream()` and `complete()` entry points
- `src/models/` - built-in model catalog and model lookup helpers
- `src/providers/` - provider adapters and runtime registry
- `src/types/` - normalized types for messages, content, image/music/video results, tools, agent contracts, and provider option maps
- `src/agent/` - stateless agent engine, adapters, helpers, and mock message builders
- `tests/unit/` - normalized runtime and provider unit tests
- `tests/integration/` - live-provider integration coverage

## Conventions

- Keep the package stateless. Credentials and request settings should be supplied per call.
- Preserve native provider responses while maintaining normalized message/event contracts.
- When adding providers, wire model metadata, provider registration, normalized runtime behavior, and tests together.
- Prefer adding unit coverage for normalization logic and integration coverage for live-provider behavior.
- Treat package-level docs as part of the public API. If the runtime surface changes, update `README.md`, `docs/`, and `CHANGELOG.md` in the same change.
