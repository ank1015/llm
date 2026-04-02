# Changelog

All notable changes to `@ank1015/llm-core` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer once its public API stabilizes.

## [Unreleased]

### Added

- Package-level README, provider notes, release checklist, and core package guide.
- Published package artifacts for `README.md`, `CHANGELOG.md`, `LICENSE`, and `docs/`.
- Public `registerProvider()` export from the package root for advanced registry extensions.
- A public-API unit test covering runtime provider registration from the root export.

### Changed

- Hardened `prepack` to run `release:check` before creating a tarball.
- Added a dedicated `release:check` script for build, typecheck, lint, unit test, and coverage validation.
- Fixed the core lint command to target only real paths inside the package.

## [0.0.4] - 2026-04-02

### Existing Surface

- Stateless multi-provider runtime with `stream()` and `complete()`.
- Built-in provider registry for OpenAI, Codex, Google, DeepSeek, Anthropic, Claude Code, Z.AI, Kimi, MiniMax, Cerebras, and OpenRouter.
- Typed model catalog, normalized message/event contracts, and a lightweight agent engine.
