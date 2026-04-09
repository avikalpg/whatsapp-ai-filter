#!/usr/bin/env bash
# build-wabridge-ios.sh
# Builds the wabridge Go package into an iOS XCFramework using gomobile.
#
# Prerequisites:
#   - macOS with Xcode command-line tools installed
#   - Go (>= 1.23)
#   - gomobile installed: go install golang.org/x/mobile/cmd/gomobile@latest
#   - gomobile init already run once
#
# Usage:
#   ./scripts/build-wabridge-ios.sh
#
# Output: packages/wabridge/ios/Wabridge.xcframework

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/packages/wabridge"
OUTPUT_DIR="$PACKAGE_DIR/ios"

export PATH="$PATH:/usr/local/go/bin"

echo "=== WACI — Build wabridge for iOS ==="
echo "  Package: $PACKAGE_DIR"
echo "  Output:  $OUTPUT_DIR"

# Verify macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "❌ iOS builds require macOS. This script must run on a Mac."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

cd "$PACKAGE_DIR"

# Ensure gomobile is available
if ! command -v gomobile &>/dev/null; then
  echo "Installing gomobile..."
  go install golang.org/x/mobile/cmd/gomobile@latest
  gomobile init
fi

echo "Running gomobile bind (iOS)..."
gomobile bind \
  -target=ios \
  -o "$OUTPUT_DIR/Wabridge.xcframework" \
  -v \
  github.com/avikalpg/whatsapp-ai-filter/wabridge

echo ""
echo "✓ Build complete: $OUTPUT_DIR/Wabridge.xcframework"
echo ""
echo "Add to your React Native / Xcode project:"
echo "  1. Drag $OUTPUT_DIR/Wabridge.xcframework into your Xcode project"
echo "  2. In Build Phases → Link Binary With Libraries, ensure Wabridge is listed"
echo "  3. In your Swift bridging header or module map, import Wabridge"
