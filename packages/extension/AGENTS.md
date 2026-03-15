# @ank1015/llm-extension

Chrome RPC package with three runtime pieces:

- `src/chrome/` - Manifest V3 extension background worker
- `src/native/` - native messaging host and TCP bridge
- `src/sdk/` - Node client with `connect()`, `ChromeClient`, and `getPageMarkdown()`

This package is intentionally low-level. It does not contain a higher-level browser automation wrapper or any observe/action helper stack.

## Commands

```bash
pnpm --filter @ank1015/llm-extension build
pnpm --filter @ank1015/llm-extension lint
pnpm --filter @ank1015/llm-extension typecheck
pnpm --filter @ank1015/llm-extension test:unit
pnpm --filter @ank1015/llm-extension test:coverage
pnpm --filter @ank1015/llm-extension test:e2e
pnpm --filter @ank1015/llm-extension test:e2e:accessibility
pnpm --filter @ank1015/llm-extension test:e2e:cookies
pnpm --filter @ank1015/llm-extension test:e2e:debugger
pnpm --filter @ank1015/llm-extension test:e2e:network
pnpm --filter @ank1015/llm-extension test:e2e:page-markdown
pnpm --filter @ank1015/llm-extension test:e2e:windows
```

## Current structure

```text
src/
  protocol/
    types.ts
    constants.ts
  sdk/
    client.ts
    connect.ts
    index.ts
    page-markdown.ts
  native/
    host.ts
    server.ts
    stdio.ts
    host-wrapper.sh
  chrome/
    background.ts
    manifest.json
tests/
  unit/
    native/
    sdk/
  e2e/
    chrome-rpc.e2e.ts
    accessibility.e2e.ts
    cookies.e2e.ts
    debugger.e2e.ts
    network.e2e.ts
    page-markdown.e2e.ts
    windows.e2e.ts
manifests/
  com.ank1015.llm.json
  install-host.sh
```

## Public surface

- protocol types/constants
- `ChromeClient`
- `createChromeClient`
- `connect`
- `ChromeServer`
- `readMessage`
- `writeMessage`
- `GetPageMarkdownOptions`

## Maintainer notes

- `debugger.*` RPC helpers are part of the package contract; do not treat them as test-only escape hatches.
- `getPageMarkdown()` is intentionally optional and depends on an external converter service.
- The build must clean `dist/` first so removed runtime surfaces do not survive in npm tarballs.
- `manifests/` must ship in the package tarball because consumers need the native-host install assets.
- The bundled Chrome background worker intentionally supports code-string execution via `scripting.executeScript`; the esbuild direct-`eval` warning is suppressed on purpose.

## Docs

- [README.md](README.md)
- [docs/README.md](docs/README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/testing.md](docs/testing.md)
