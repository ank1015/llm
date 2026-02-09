#!/bin/bash
# Installs the E2E test script as the native host.
#
# Usage: ./install-e2e-host.sh <extension-id>
#
# This modifies the wrapper at ~/.local/share/llm-native-host/run-host.sh
# to run the E2E test instead of the regular host. After testing, run
# install-host.sh again to restore the normal host.

set -euo pipefail

EXTENSION_ID="${1:?Usage: ./install-e2e-host.sh <extension-id>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
E2E_SCRIPT="$PACKAGE_DIR/tests/e2e/chrome-rpc.e2e.ts"

if [ ! -f "$E2E_SCRIPT" ]; then
  echo "Error: E2E test script not found at $E2E_SCRIPT"
  exit 1
fi

INSTALL_DIR="$HOME/.local/share/llm-native-host"
mkdir -p "$INSTALL_DIR"

NODE_PATH="$(which node)"
TSX_PATH="$(cd "$PACKAGE_DIR" && pwd)/node_modules/.bin/tsx"

if [ ! -f "$TSX_PATH" ]; then
  # Try monorepo root
  TSX_PATH="$(cd "$PACKAGE_DIR/../.." && pwd)/node_modules/.bin/tsx"
fi

if [ ! -f "$TSX_PATH" ]; then
  echo "Error: tsx not found. Run 'pnpm install' first."
  exit 1
fi

# Create wrapper that runs E2E test via tsx
WRAPPER_PATH="$INSTALL_DIR/run-host.sh"
cat > "$WRAPPER_PATH" <<WRAPPER
#!/bin/sh
exec "$NODE_PATH" --import "$TSX_PATH" "$E2E_SCRIPT"
WRAPPER
chmod 755 "$WRAPPER_PATH"

# Install native messaging host manifest
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$MANIFEST_DIR"
MANIFEST="$MANIFEST_DIR/com.ank1015.llm.json"

cat > "$MANIFEST" <<EOF
{
  "name": "com.ank1015.llm",
  "description": "LLM native messaging host (E2E test mode)",
  "path": "$WRAPPER_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo "Installed E2E test host:"
echo "  wrapper:  $WRAPPER_PATH"
echo "  test:     $E2E_SCRIPT"
echo "  manifest: $MANIFEST"
echo ""
echo "Now reload the extension in Chrome (chrome://extensions → refresh icon)."
echo "Results will be written to /tmp/chrome-rpc-e2e-results.json"
echo ""
echo "To restore the normal host, run:"
echo "  ./manifests/install-host.sh $EXTENSION_ID"
