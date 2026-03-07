#!/usr/bin/env bash
# build-wabridge-android.sh
# Builds the wabridge Go package into an Android AAR using gomobile.
#
# Works on Linux and macOS. Does NOT require macOS.
#
# Prerequisites:
#   - Go (>= 1.23) at /usr/local/go or on PATH
#   - Android NDK r27+; set ANDROID_NDK_HOME or place in $ANDROID_HOME/ndk/
#   - Android SDK (cmdline-tools + build-tools + platform 21); set ANDROID_HOME
#   - On Ubuntu: sudo apt-get install -y openjdk-21-jdk-headless
#
# Quick setup on Ubuntu (one-time):
#   # Install Android cmdline-tools
#   mkdir -p ~/Android/Sdk/cmdline-tools
#   curl -L https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip | \
#     unzip -q - -d ~/Android/Sdk/cmdline-tools/
#   mv ~/Android/Sdk/cmdline-tools/cmdline-tools ~/Android/Sdk/cmdline-tools/latest
#   yes | ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager --licenses
#   ~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager "platforms;android-21" "build-tools;34.0.0"
#   # Install NDK r27b
#   curl -L https://dl.google.com/android/repository/android-ndk-r27b-linux.zip | \
#     unzip -q - -d ~/
#   mkdir -p ~/Android/Sdk/ndk && ln -sf ~/android-ndk-r27b ~/Android/Sdk/ndk/27.1.12297006
#   export ANDROID_HOME=~/Android/Sdk ANDROID_NDK_HOME=~/android-ndk-r27b
#
# Usage:
#   ./scripts/build-wabridge-android.sh
#
# Output:
#   packages/wabridge/android/wabridge.aar  (also copied to apps/mobile-client/android/app/libs/)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$REPO_ROOT/packages/wabridge"
OUTPUT_DIR="$PACKAGE_DIR/android"
APP_LIBS="$REPO_ROOT/apps/mobile-client/android/app/libs"

export PATH="$PATH:/usr/local/go/bin:$HOME/go/bin"

echo "=== WACI — Build wabridge for Android ==="
echo "  Package:    $PACKAGE_DIR"
echo "  Output:     $OUTPUT_DIR"
echo "  App libs:   $APP_LIBS"
echo "  ANDROID_HOME: ${ANDROID_HOME:-not set}"
echo "  ANDROID_NDK_HOME: ${ANDROID_NDK_HOME:-not set}"

mkdir -p "$OUTPUT_DIR" "$APP_LIBS"

cd "$PACKAGE_DIR"

# Ensure gomobile is installed from within this module
if ! command -v gomobile &>/dev/null; then
  echo "Installing gomobile..."
  go get golang.org/x/mobile/bind
  go install golang.org/x/mobile/cmd/gomobile@latest
  go install golang.org/x/mobile/cmd/gobind@latest
  gomobile init
fi

echo "Running gomobile bind (arm64 + arm)..."
gomobile bind \
  -target=android/arm64,android/arm \
  -androidapi=21 \
  -o "$OUTPUT_DIR/wabridge.aar" \
  -v \
  .

echo ""
echo "✓ Build complete: $OUTPUT_DIR/wabridge.aar ($(du -sh "$OUTPUT_DIR/wabridge.aar" | cut -f1))"

# Auto-copy to app libs
cp "$OUTPUT_DIR/wabridge.aar" "$APP_LIBS/wabridge.aar"
echo "✓ Copied to: $APP_LIBS/wabridge.aar"
