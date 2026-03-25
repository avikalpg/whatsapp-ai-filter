#!/usr/bin/env bash
# WACI Firebase Test Lab Smoke Test
# Runs a robo test on the APK to verify:
#   1. App launches without crashing (wabridge .aar stability)
#   2. Basic UI renders correctly
#   3. No native crash on startup
#
# Usage: ./scripts/firebase-smoke-test.sh <path-to-apk>
#        ./scripts/firebase-smoke-test.sh  (auto-finds latest APK)
#
# Prerequisites:
#   - gcloud CLI authenticated (service account at ~/.openclaw/workspace/firebase-service-account.json)
#   - Firebase project: lively-hull-235015
#
# Free tier: 15 virtual device tests/day, 5 physical device tests/day

set -euo pipefail

PROJECT_ID="lively-hull-235015"
# Use a Pixel-like virtual device with recent Android
DEVICE_MODEL="MediumPhone.arm"
DEVICE_VERSION="34"
TEST_TIMEOUT="120s"
RESULTS_BUCKET="gs://${PROJECT_ID}-test-results"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Find APK
APK_PATH="${1:-}"
if [ -z "$APK_PATH" ]; then
    # Auto-find latest release APK
    APK_PATH=$(find ~/projects/whatsapp-ai-filter/apps/mobile/android/app/build/outputs/apk -name "*.apk" -type f 2>/dev/null | sort -t/ -k1 | tail -1)
    if [ -z "$APK_PATH" ]; then
        echo -e "${RED}No APK found. Build first with: cd apps/mobile/android && ./gradlew assembleRelease${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}🔥 Firebase Test Lab Smoke Test${NC}"
echo -e "   APK: ${APK_PATH}"
echo -e "   Device: ${DEVICE_MODEL} (API ${DEVICE_VERSION})"
echo ""

# Verify APK exists
if [ ! -f "$APK_PATH" ]; then
    echo -e "${RED}APK not found: ${APK_PATH}${NC}"
    exit 1
fi

# Ensure gcloud is authenticated
if ! gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | grep -q .; then
    echo "Authenticating with service account..."
    gcloud auth activate-service-account \
        --key-file=/home/azureuser/.openclaw/workspace/firebase-service-account.json
fi

gcloud config set project "$PROJECT_ID" --quiet

# Run robo test
echo -e "${YELLOW}Running robo test (this takes ~2-3 minutes)...${NC}"
RESULT=$(gcloud firebase test android run \
    --type robo \
    --app "$APK_PATH" \
    --device "model=${DEVICE_MODEL},version=${DEVICE_VERSION},locale=en,orientation=portrait" \
    --timeout "$TEST_TIMEOUT" \
    --results-history-name "waci-smoke-test" \
    --no-record-video \
    --format=json \
    2>&1) || true

# Parse results
if echo "$RESULT" | grep -q '"outcome": "passed"'; then
    echo -e "${GREEN}✅ SMOKE TEST PASSED${NC}"
    echo -e "   App launches, no native crashes, UI renders."
    exit 0
elif echo "$RESULT" | grep -q '"outcome": "failed"'; then
    echo -e "${RED}❌ SMOKE TEST FAILED${NC}"
    echo "$RESULT" | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    for step in data:
        if step.get('outcome') == 'failed':
            print(f'   Failure: {step.get(\"failureDetail\", {}).get(\"crashed\", \"unknown\")}')
            print(f'   Details: {step.get(\"testDetails\", \"none\")}')
except: pass
" 2>/dev/null || echo "   See Firebase console for details."
    exit 1
else
    # Check for common error patterns in raw output
    if echo "$RESULT" | grep -q "PASSED"; then
        echo -e "${GREEN}✅ SMOKE TEST PASSED${NC}"
        exit 0
    elif echo "$RESULT" | grep -q "FAILED\|crashed\|Exception"; then
        echo -e "${RED}❌ SMOKE TEST FAILED${NC}"
        echo "$RESULT" | tail -20
        exit 1
    else
        echo -e "${YELLOW}⚠️ Could not determine result. Raw output:${NC}"
        echo "$RESULT" | tail -30
        exit 2
    fi
fi
