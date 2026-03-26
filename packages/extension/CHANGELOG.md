# Changelog

All notable changes to this package will be documented in this file.

## 0.0.13 - 2026-03-26

- added a publish-time guard that rejects `npm publish` so public releases go out through `pnpm publish`

## 0.0.12 - 2026-03-15

- narrowed the package to a Chrome RPC bridge by removing the higher-level browser automation layer
- kept `ChromeClient.getPageMarkdown(...)` as an optional helper and made converter failures throw explicit errors
- replaced the old window-focused end-to-end coverage with direct RPC and page-markdown coverage
- refreshed package docs, metadata, clean-build packaging, and publish contents for open-source release readiness
- updated the browser-use skill docs to the new RPC-first model
