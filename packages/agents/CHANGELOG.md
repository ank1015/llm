# Changelog

All notable changes to this package will be documented in this file.

## Unreleased

## 0.0.4 - 2026-03-18

- added a managed web helper API built on `@ank1015/llm-extension`, including browser, tab, debugger, download, screenshot, markdown, and upload helpers
- added the bundled `web` skill with API, workflow, and task-specific browser references
- updated the local CLI to install both `ai-images` and `web` into artifact-local skill state
- fixed a startup crash in the bundled skills loader caused by package-root detection reading `PACKAGE_JSON_FILENAME` before initialization
- added regression coverage for direct skills-module startup and the reusable helper-backed temp workspace

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
