# Changelog

All notable changes to `@ank1015/llm-types` will be documented in this file.

The format is based on Keep a Changelog and this project uses semantic versioning.

## [0.0.3] - 2026-03-26

- added `prepack` so packed tarballs always rebuild from a clean `dist/`
- added a publish-time guard that rejects `npm publish` so public releases go out through `pnpm publish`

## [0.0.2] - 2026-03-15

- refreshed the package README and AGENTS docs to match the current provider set and package scope
- cleaned the build output before compilation to avoid stale publish artifacts in `dist/`
- improved npm package metadata for open-source publishing

## [0.0.1] - 2026-03-15

- initial public release
