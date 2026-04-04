# Changelog

All notable changes to `@ank1015/llm-core` will be documented in this file.

The format is based on Keep a Changelog and this package follows SemVer once its public API stabilizes.

## [Unreleased]

### Added

- Added a dedicated image-generation runtime with `generateImage()`, image model catalogs, and a separate image provider registry.
- Added a dedicated music-generation runtime with `generateMusic()`, music model catalogs, and a separate music provider registry.
- Added a dedicated video-generation runtime with `generateVideo()`, video model catalogs, and a separate video provider registry.
- Added built-in image providers for OpenAI Images API and Google Gemini native image generation.
- Added a built-in Google Lyria music provider with normalized text/audio output and modality-aware usage accounting.
- Added a built-in Google Veo video provider with normalized video assets and operation polling.
- Added normalized image result types with preserved native responses and modality-aware image usage accounting.
- Added normalized music result types with preserved native responses and dedicated track output.
- Added normalized video result types with preserved native operations and provider responses.
- Added image-model pricing metadata and `calculateImageCost()` support for computed image spend.
- Added music-model pricing metadata with `calculateMusicCost()` support for per-request music spend.
- Added Veo model pricing metadata with `calculateVideoCost()` support and estimated video usage cost.
- Added unit coverage for the image public API and provider normalization paths.
- Added unit coverage for the music public API and Google Lyria provider helpers.
- Added live Google Lyria integration coverage for clip, WAV, and image-guided music generation.
- Added unit coverage for the video public API and Google Veo provider helpers.
- Added live Google Veo integration coverage for interpolation, reference-image generation, image-to-video, and video extension.

## [0.0.5] - 2026-04-02

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
