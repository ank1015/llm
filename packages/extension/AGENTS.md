# @ank1015/llm-extension

Chrome extension (Manifest V3) and Node.js native messaging host that communicate via Chrome's Native Messaging protocol (stdin/stdout, length-prefixed JSON).

## Commands

```bash
pnpm build            # Build native host (tsc) + Chrome extension (esbuild)
pnpm build:native     # Build native host only
pnpm build:chrome     # Bundle Chrome extension only
pnpm dev              # Watch mode for both
pnpm test             # Run tests
pnpm typecheck        # Type-check both tsconfigs
pnpm clean            # Remove dist/
```

## Structure

```
src/
  index.ts                  # Public barrel exports (types + stdio utils)
  shared/
    message.types.ts        # ExtensionMessage / NativeResponse discriminated unions
    protocol.constants.ts   # NATIVE_HOST_NAME, MAX_MESSAGE_SIZE, LENGTH_PREFIX_BYTES
  chrome/
    manifest.json           # Manifest V3 (nativeMessaging permission)
    background.ts           # Service worker — connectNative + message handling
  native/
    host.ts                 # Entry point — stdin/stdout message loop
    stdio.ts                # Read/write length-prefixed JSON
    host-wrapper.sh         # Shell wrapper Chrome executes to invoke Node
tests/
  unit/native/
    stdio.test.ts           # Length-prefix encode/decode tests
manifests/
  com.ank1015.llm.json      # Native host manifest template
  install-host.sh           # Install manifest to Chrome NativeMessagingHosts dir
```

## Two TypeScript Configs

- `tsconfig.json` — Native host (NodeNext, emits to `dist/`)
- `tsconfig.chrome.json` — Chrome extension (bundler resolution, noEmit, type-check only)

## Setup

1. `pnpm build`
2. Load `dist/chrome/` as unpacked extension in `chrome://extensions`
3. Copy the extension ID
4. `./manifests/install-host.sh <extension-id>`
5. **Quit and reopen Chrome** (manifest changes require full restart)

The install script copies host files to `~/.local/share/llm-native-host/`
because Chrome's sandbox on macOS blocks executing scripts from Desktop.

## Conventions

- Messages use discriminated unions keyed on `type`
- Every request carries a `requestId` for correlation
- Native stdio functions accept injected streams for testability
- Chrome extension uses lazy `connectNative()` with reconnect on disconnect
