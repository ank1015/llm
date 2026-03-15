# Changelog

All notable changes to this package will be documented in this file.

## 0.0.2 - 2026-03-15

- removed sdk-side usage-tracking hooks from `complete()`, `stream()`, and `Conversation`
- removed stale image docs and tests after the image APIs moved out of `sdk`
- moved adapter implementation tests out of `sdk` into `sdk-adapters`
- refreshed package docs and metadata for OSS/readiness
- made the build clean `dist/` before emitting so published tarballs do not contain stale artifacts
