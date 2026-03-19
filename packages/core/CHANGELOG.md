# Changelog

All notable changes to this package will be documented in this file.

## UNRELEASED

- added `MiniMax-M2.7` and `MiniMax-M2.7-highspeed` to the MiniMax model catalog with their provider pricing metadata
- updated MiniMax unit and live integration coverage to exercise the new model ids
- replaced OpenAI `gpt-5-mini` and `gpt-5-nano` with `gpt-5.4-mini` and `gpt-5.4-nano`, including updated pricing metadata
- added `gpt-5.4-mini` to the Codex model catalog with provider pricing metadata
- updated OpenAI and Codex integration coverage to check current provider support for the new model ids

## 0.0.2 - 2026-03-15

- refreshed `README.md`, `AGENTS.md`, and `ADDING_PROVIDER.md` to match the current provider layout and model catalog structure
- added package-local docs for architecture, providers, and testing
- improved package publish metadata and package-local scripts
- made integration test execution credential-aware and sequential at the package command level
- made builds clean `dist/` before emitting artifacts and ensured `prepack` rebuilds before packaging
- added package-local `LICENSE`
- documented observed live-provider integration flakes without changing runtime behavior
