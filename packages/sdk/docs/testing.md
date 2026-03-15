# Testing and Ownership

`@ank1015/llm-sdk` should only test sdk-owned behavior.

## What Belongs Here

- credential-resolution behavior in `complete()` and `stream()`
- `Conversation` state and execution behavior
- `SessionManager` delegation behavior
- live-provider wrapper checks for `complete()`, `stream()`, and conversation flows

## What Does Not Belong Here

- filesystem key-storage tests
- filesystem session-storage tests
- in-memory adapter implementation tests
- removed adapter surfaces such as usage tracking

Those implementation tests belong in `@ank1015/llm-sdk-adapters`.

## Commands

- `pnpm build`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`

## Integration Test Environment

The sdk integration suite skips provider-specific tests when credentials are not present.

Common environment variables:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `KIMI_API_KEY`
- `ZAI_API_KEY`

## Release Checks

Before publishing:

- `lint` must pass
- `typecheck` must pass
- `build` must emit a clean `dist/`
- `test:unit` must pass without adapter-implementation tests
- `npm pack --dry-run` must not include orphaned outputs from removed modules
