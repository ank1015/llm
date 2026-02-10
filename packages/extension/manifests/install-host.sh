#!/bin/bash
# Installs the native messaging host manifest on macOS.
# Usage: ./install-host.sh [extension-id]
#
# After loading the unpacked extension in Chrome, copy its ID
# from chrome://extensions and pass it as the first argument.
#
# NOTE: Chrome's sandbox on macOS blocks executing scripts from certain
# directories (e.g. Desktop). This script copies host files to
# ~/.local/share/llm-native-host/ which is outside the sandbox.

set -euo pipefail

EXTENSION_ID="${1:?Usage: ./install-host.sh <extension-id>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PACKAGE_DIR/dist"

if [ ! -f "$DIST_DIR/native/host.js" ]; then
  echo "Error: host.js not found. Run 'pnpm build' in packages/extension first."
  exit 1
fi

# Chrome's sandbox on macOS blocks executing scripts from certain directories
# (e.g. ~/Desktop). We create a thin wrapper in ~/.local/share/ which Chrome
# can execute, but the wrapper runs node against the project's dist/ directly.
# This way Node resolves workspace packages from the monorepo's node_modules.
INSTALL_DIR="$HOME/.local/share/llm-native-host"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Get the absolute path to the node binary currently in use
NODE_PATH="$(which node)"

# Create wrapper script that runs host.js from the project dist/ directory.
# Node resolves bare specifier imports (workspace packages, dependencies) by
# walking up from host.js → packages/extension/ → monorepo root node_modules.
WRAPPER_PATH="$INSTALL_DIR/run-host.sh"
cat > "$WRAPPER_PATH" <<WRAPPER
#!/bin/sh
exec "$NODE_PATH" "$DIST_DIR/native/host.js"
WRAPPER
chmod 755 "$WRAPPER_PATH"

# Install native messaging host manifest
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$MANIFEST_DIR"
MANIFEST="$MANIFEST_DIR/com.ank1015.llm.json"

cat > "$MANIFEST" <<EOF
{
  "name": "com.ank1015.llm",
  "description": "LLM native messaging host",
  "path": "$WRAPPER_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo "Installed native host:"
echo "  wrapper:  $WRAPPER_PATH"
echo "  host.js:  $DIST_DIR/native/host.js"
echo "  node:     $NODE_PATH"
echo "Installed manifest to: $MANIFEST"
echo "  extension: $EXTENSION_ID"
echo ""
echo "Restart Chrome (Cmd+Q) and reload the extension to test."
