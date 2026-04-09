# CLAUDE.md — WACI Project Guide

This file helps AI coding assistants understand the project structure, architecture,
build commands, and test procedures.

---

## Project Overview

**WACI** (WhatsApp AI Content Intelligence) is a mobile-first open-source app that
uses AI to triage WhatsApp messages against user-defined filters.

```
whatsapp-ai-filter/
  core/                  # Original Node.js desktop client (v1.x)
  landing-page/          # Next.js marketing site
  packages/wabridge/     # Go bridge package (WACI M1) ← NEW
  apps/mobile-client/    # Expo React Native app (WACI M1) ← NEW
  scripts/               # Build scripts
```

---

## Mobile Architecture (WACI M1)

```
┌─────────────────────────────────────────────────┐
│  React Native (Expo Router)                     │
│  apps/mobile-client/                            │
│    app/             ← screens (Expo Router)     │
│    src/native/      ← NativeModule TS wrapper   │
│    src/stores/      ← Zustand state             │
└──────────────┬──────────────────────────────────┘
               │ NativeModules.Wabridge (JS → Native)
┌──────────────▼──────────────────────────────────┐
│  Native Module                                  │
│  Android: WabridgeModule.kt + WabridgePackage   │
│  iOS:     WabridgeModule.swift + .m             │
└──────────────┬──────────────────────────────────┘
               │ gomobile .aar / .xcframework
┌──────────────▼──────────────────────────────────┐
│  Go Bridge  packages/wabridge/                  │
│    wabridge.go       ← gomobile-exported API    │
│    bridge/client.go  ← whatsmeow lifecycle      │
│    bridge/store.go   ← SQLite CRUD              │
│    bridge/triage.go  ← Claude Haiku triage      │
└──────────────┬──────────────────────────────────┘
               │
   whatsmeow (WhatsApp multi-device protocol)
   Claude Haiku API (ai triage)
   SQLite (local-first storage)
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Go + gomobile | Single WhatsApp implementation shared between Android & iOS |
| Claude Haiku | Fast & cheap; sufficient for single-sentence triage |
| Local-first SQLite | No backend infra; privacy-preserving |
| Phone-number pairing | Better UX than QR code in a mobile app |
| Sequential triage | Avoids Claude rate limiting |
| Expo Router | File-based routing; easy deep-link support |

---

## Build Commands

### Go Bridge

```bash
cd packages/wabridge
export PATH=$PATH:/usr/local/go/bin

# Validate
go mod tidy
go build ./...
go vet ./...

# Run CLI smoke test
go run ./cmd/test-bridge --db /tmp/test.db
```

### Build for Android (requires Android NDK + gomobile)

```bash
# Install gomobile once
go install golang.org/x/mobile/cmd/gomobile@latest
gomobile init

# Build
./scripts/build-wabridge-android.sh
# Output: packages/wabridge/android/wabridge.aar
# Copy to: apps/mobile-client/android/app/libs/wabridge.aar
```

### Build for iOS (requires macOS + Xcode)

```bash
./scripts/build-wabridge-ios.sh
# Output: packages/wabridge/ios/Wabridge.xcframework
# Drag into Xcode project
```

### React Native App

```bash
cd apps/mobile-client

# Install JS deps
npm install

# Start Metro bundler
npx expo start

# Run on Android (requires emulator or device + wabridge.aar)
npx expo run:android

# Run on iOS (macOS only, requires Xcode + xcframework)
npx expo run:ios
```

---

## Test Procedure

### Go Bridge (unit / integration)

```bash
cd packages/wabridge
export PATH=$PATH:/usr/local/go/bin

# 1. Build check
go build ./...

# 2. Vet
go vet ./...

# 3. CLI smoke test (creates a DB, saves/reads a filter, reports IsLinked)
go run ./cmd/test-bridge --db /tmp/waci-smoke.db

# 4. Full pairing test (needs a real phone)
go run ./cmd/test-bridge \
  --db /tmp/waci-test.db \
  --api-key $CLAUDE_API_KEY \
  --phone +1XXXXXXXXXX
```

### React Native App

1. Build the Go bridge for your target platform (see above).
2. Place the `.aar` or `.xcframework` in the correct location.
3. `npx expo run:android` or `npx expo run:ios`.
4. On first launch: enter Claude API key → enter phone number → enter pairing code in WhatsApp.
5. Go to Filters tab → create a filter → go back to Inbox → tap Sync.
6. Verify matched messages appear in the Inbox.

---

## Environment Variables

| Variable | Usage |
|---|---|
| `CLAUDE_API_KEY` | Claude API key for the CLI test-bridge tool |

In the mobile app the key is entered by the user and stored in iOS Keychain / Android Keystore via `expo-secure-store`.

---

## Codebase Conventions

- **Go**: standard formatting (`gofmt`), `(Value, error)` return pattern
- **TypeScript**: strict mode; no `any` unless unavoidable
- **Screens**: Expo Router file-based routing under `app/`
- **State**: Zustand store in `src/stores/appStore.ts`
- **Native calls**: always go through `src/native/wabridge.ts` — never call `NativeModules` directly from screens

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable releases |
| `alokit/waci-m1-go-bridge` | WACI Milestone 1 implementation |
