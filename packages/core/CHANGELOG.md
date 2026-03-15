# Changelog

All notable changes to this package will be documented in this file.

## 0.0.2 - 2026-03-15

- refreshed `README.md`, `AGENTS.md`, and `ADDING_PROVIDER.md` to match the current provider layout and model catalog structure
- added package-local docs for architecture, providers, and testing
- improved package publish metadata and package-local scripts
- made integration test execution credential-aware and sequential at the package command level
- made builds clean `dist/` before emitting artifacts and ensured `prepack` rebuilds before packaging
- added package-local `LICENSE`
- documented observed live-provider integration flakes without changing runtime behavior
