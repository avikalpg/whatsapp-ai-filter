# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Prerequisites

- **JDK 17+** required for Gradle. On macOS: `brew install --cask temurin@17`. Set `JAVA_HOME` to point to it if your system default is older (`export JAVA_HOME=$(/usr/libexec/java_home -v 17)`).
- **Physical Android device**: `.env.development` defaults `EXPO_PUBLIC_API_URL` to `http://localhost:3000`, which resolves to the device itself, not your machine. Change it to your machine's LAN IP (e.g. `http://192.168.x.x:3000`) when testing on a real device. Find your IP with `ipconfig getifaddr en0`. Do not commit this change.

## Commands

```bash
# Install dependencies
npm install

# Start Metro bundler
npx expo start

# Run on Android (requires android/app/libs/wabridge.aar)
npx expo run:android

# Run on iOS (requires Wabridge.xcframework, macOS only)
npx expo run:ios
```

There are no JS unit tests. To test the Go bridge layer, see `packages/wabridge/` in the project root.

---

## Architecture

### State

All app state lives in a single Zustand store: `src/stores/appStore.ts`.

Key state slices:
- **Setup**: `isInitialized`, `initError`, `isLinked`, `authToken`, `trialExpiresAt`
- **Sync**: `syncing`, `lastSyncTimestamp`, `lastSyncResult`, `historySyncing`, `historySyncDone`
- **Data**: `filters: Filter[]`, `matches: Record<filterId, FilterMatch[]>`

Important actions: `initialize()` (called once on app start), `syncAndTriage()`, `startHistorySync()`, `saveFilter()`, `loadMatches()`.

Persistence uses AsyncStorage for non-sensitive data (`waci_last_sync_ts`, `waci_db_path`) and SecureStore for credentials (`waci_device_id`, `waci_auth_token`).

### Native Bridge

All calls to the Go bridge go through `src/native/wabridge.ts` — never call `NativeModules.Wabridge` directly from screens. This wrapper defines all TypeScript types (`Filter`, `FilterMatch`, `SyncResult`, `GroupInfo`) and all bridge methods are async/Promise-based.

### Routing & Navigation

File-based routing via Expo Router:

```
app/
├── _layout.tsx          # Root: redirects based on isLinked
├── link-whatsapp.tsx    # Pairing flow (polling every 3s for confirmLinked)
├── settings.tsx         # Settings modal
└── (tabs)/
    ├── index.tsx        # Inbox: filters with match counts, auto-sync on open/foreground
    └── filters.tsx      # Filter list
filters/
├── new.tsx              # Create filter (modal)
└── [id]/
    ├── index.tsx        # Edit filter (modal)
    └── messages.tsx     # Matched messages for a filter
```

Navigation protection is in `app/_layout.tsx`: unlinked → `/link-whatsapp`, linked → `/(tabs)`.

### Backend API

`src/api/chat.ts` is a thin client for the backend proxy (default: `https://whatsapp-ai-filter.vercel.app`). The app uses device-based auth: stable `deviceId` (SecureStore) → JWT → auto-refresh on 401.

Error codes to handle: `TRIAL_EXPIRED`, `TRIAL_BUDGET_EXHAUSTED` (HTTP 402), `UNAUTHORIZED` (HTTP 401).

Environment: `EXPO_PUBLIC_API_URL` (separate `.env.development`, `.env.staging`, `.env.production` files).

### Filter Data Model

Filters have two independent targeting modes:
- **DMs**: `process_dms` + sub-flags (`dm_contacts`, `dm_non_contacts`, `dm_businesses`, `dm_non_businesses`)
- **Groups**: `process_groups` + `group_mode: 'inclusion' | 'exclusion' | null` + `group_list: string[]` (JIDs)

Both modes can be active simultaneously. Inclusion mode requires ≥1 group in `group_list`.
