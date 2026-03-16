# Changelog

All notable changes to this package will be documented in this file.

## Unreleased

- fixed a startup crash in the bundled skills loader caused by package-root detection reading `PACKAGE_JSON_FILENAME` before initialization
- added a `tsx`-based regression test covering direct skills-module startup for the local CLI/runtime path

## 0.0.3 - 2026-03-15

- added a local CLI agent runner backed by `Conversation`, the file keys adapter, and an in-memory session manager
- added section override support in `createSystemPrompt()` and used it for the CLI's directory-only prompt
- expanded the `ai-images` skill with model-selection guidance and a new `choose-model.md` reference

## 0.0.2 - 2026-03-15

- aligned the package around general-purpose tools, skill runtime, and helper-backed skill APIs
- added package-level docs, including skill authoring and testing guidance
- added the first helper-backed bundled skill, `ai-images`
- documented and validated the reusable `.max/temp` TypeScript workspace for helper-backed skills
- cleaned package metadata and packaging behavior for OSS readiness
