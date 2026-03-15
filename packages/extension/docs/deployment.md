# Deployment

## Build outputs

`pnpm --filter @ank1015/llm-extension build` produces:

- `dist/chrome/` - unpacked Chrome extension assets
- `dist/native/` - native host runtime
- `dist/index.js` - Node client entrypoint

The build cleans `dist/` first so removed runtime surfaces do not leak into releases.

## Chrome setup

1. Build the package.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load unpacked from `packages/extension/dist/chrome/`.
5. Copy the extension ID.

## Native host setup

For macOS, run:

```bash
./packages/extension/manifests/install-host.sh <extension-id>
```

This script installs a wrapper under `~/.local/share/llm-native-host/` and writes the native messaging manifest into Chrome's macOS host directory.

For non-macOS environments, use `manifests/com.ank1015.llm.json` as the template for manual installation. This package does not currently ship a first-party Linux or Windows installer script.

## Publish surface

The npm tarball must include:

- `dist/`
- `manifests/`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
