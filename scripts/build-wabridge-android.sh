#!/usr/bin/env bash
# build-wabridge-android.sh
# Builds the wabridge Go package into an Android AAR using gomobile.
#
# Prerequisites:
#   - Go (>= 1.23)
#   - Android NDK installed; ANDROID_NDK_HOME set (or ANDROID_HOME with NDK)
#   - gomobile installed: go install golang.org/x/mobile/cmd/gomobile@latest
#   - gomobile init already run once
#
# Usage:
#   ANDROID_NDK_HOME=/path/to/ndk ./scripts/build-wabridge-android.sh
#
# Output: packages/wabridge/android/wabridge.aar

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/packages/wabridge"
OUTPUT_DIR="$PACKAGE_DIR/android"

export PATH="$PATH:/usr/local/go/bin"

echo "=== WACI — Build wabridge for Android ==="
echo "  Package: $PACKAGE_DIR"
echo "  Output:  $OUTPUT_DIR"

mkdir -p "$OUTPUT_DIR"

cd "$PACKAGE_DIR"

# Ensure gomobile is available
if ! command -v gomobile &>/dev/null; then
  echo "Installing gomobile..."
  go install golang.org/x/mobile/cmd/gomobile@latest
  gomobile init
fi

echo "Running gomobile bind (Android)..."
gomobile bind \
  -target=android \
  -androidapi=21 \
  -o "$OUTPUT_DIR/wabridge.aar" \
  -v \
  github.com/avikalpg/whatsapp-ai-filter/wabridge

echo ""
echo "✓ Build complete: $OUTPUT_DIR/wabridge.aar"
echo ""
echo "Add to your React Native / Android project:"
echo "  1. Copy $OUTPUT_DIR/wabridge.aar to android/app/libs/"
echo "  2. In android/app/build.gradle add:"
echo "       implementation(name: 'wabridge', ext: 'aar')"
echo "       implementation 'com.google.protobuf:protobuf-javalite:3.21.9'"
