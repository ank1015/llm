# Changelog

All notable changes to this package will be documented in this file.

## Unreleased

- added `Conversation.promptMessage()` so callers can submit fully constructed user messages with mixed text and attachment blocks
- flushes queued external persistence callbacks before surfacing runner errors so user messages are not dropped on failed turns

## 0.0.2 - 2026-03-15

- removed sdk-side usage-tracking hooks from `complete()`, `stream()`, and `Conversation`
- removed stale image docs and tests after the image APIs moved out of `sdk`
- moved adapter implementation tests out of `sdk` into `sdk-adapters`
- refreshed package docs and metadata for OSS/readiness
- made the build clean `dist/` before emitting so published tarballs do not contain stale artifacts
