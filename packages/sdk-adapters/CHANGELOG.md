# Changelog

All notable changes to this package will be documented in this file.

## Unreleased

## 0.0.3 - 2026-03-26

- republished the package with pnpm so published dependency metadata no longer leaks `workspace:` ranges to npm consumers

## 0.0.2 - 2026-03-15

- removed usage-tracking adapters from the published package surface
- regrouped adapter implementations into `file-system`, `memory`, and `shared` folders
- moved credential reload helpers out of `sdk-adapters` and dropped the old keys UI
- added package docs, release metadata, and clean-build packaging safeguards
