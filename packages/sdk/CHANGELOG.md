# Changelog

All notable changes to `@ank1015/llm-sdk` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer once its public API stabilizes.

## [Unreleased]

### Added

- Package-level README, package guide, setup notes, and release checklist.
- Published package artifacts for `README.md`, `CHANGELOG.md`, `LICENSE`, and `docs/`.

### Changed

- Hardened `prepack` to run `release:check` before creating a tarball.
- Added a dedicated `release:check` script for build, typecheck, lint, unit test, and coverage validation.
- Promoted `@sinclair/typebox` to a runtime dependency so the published `.d.ts` surface resolves cleanly for consumers.
- Added the missing Vitest V8 coverage dependency and cleaned the package lint baseline.

## [0.0.3]

### Existing Surface

- `llm()` and `agent()` helpers over `@ank1015/llm-core` with curated model IDs.
- Keys-file credential resolution, response helpers, and JSONL-backed session utilities.
- Unit and OpenAI integration coverage for one-off calls and stateful agent runs.
