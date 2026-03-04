# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp AI Filter (WACI — WhatsApp Calm Inbox) is a monorepo with four applications:
- **`core/`** — Node.js/TypeScript bot that monitors WhatsApp groups and uses AI to filter messages based on user interests
- **`landing-page/`** — Next.js marketing website with a PostgreSQL-backed analytics API
- **`apps/mobile-server/`** — Centralized multi-tenant Express + TypeScript server. Manages per-user WhatsApp sessions (whatsapp-web.js), runs LLM filtering, stores results in PostgreSQL (Neon). Auth via JWT issued on WhatsApp pairing.
- **`apps/mobile-client/`** — Expo (SDK 54) React Native app. Feed of AI-filtered messages, filter management, WhatsApp linking via phone number pairing code.

## Commands

### Core Bot (`cd core/`)

```bash
npm install                  # Install dependencies
npm run build                # Compile TypeScript → dist/
npm start                    # Run with ts-node (production env)
npm run start:dev            # Run with ts-node (NODE_ENV=dev)
npm run dev                  # Run with nodemon (auto-reload, NODE_ENV=dev)
npm run serve                # Run compiled JS (requires build first)
```

No test runner is configured; there are no test files.

### Landing Page (`cd landing-page/`)

```bash
npm install
npm run dev      # Next.js dev server with Turbopack
npm run build    # Production build
npm run lint     # ESLint
```

### PM2 (production process manager)

```bash
pm2 start ecosystem.config.js   # Start from core/
pm2 logs whatsapp-ai-filter
pm2 restart whatsapp-ai-filter
pm2 status
```

## Environment Setup

Copy `core/.env.example` → `core/.env`. At least one AI key is required:

```env
PERPLEXITY_API_KEY=...   # Recommended
OPENAI_API_KEY=...       # Fallback
ANALYTICS_ENABLED=true   # Optional; set false to disable
```

`NODE_ENV` controls the analytics endpoint: `dev` → `http://localhost:3000`, anything else → `https://whatsapp-ai-filter.vercel.app`.

Runtime data files (not committed):
- `data/user_config.json` — user preferences (interests, group filters, chat IDs)
- `data/analytics.json` — installation UUID and analytics config
- `.wwebjs_auth/` — WhatsApp Web session (Puppeteer)

## Architecture

### Core Bot Message Flow

1. **`src/index.ts`** — Entry point. Registers `message_create` on the WhatsApp client, applies routing logic (group inclusion/exclusion, command vs. content message), then delegates to the LLM or command handler.
2. **`src/whatsapp.ts`** — Initializes the `whatsapp-web.js` client (Puppeteer). Emits `ready` when the QR scan succeeds.
3. **`src/llm/index.ts`** — LLM orchestrator. Tries Perplexity first, falls back to OpenAI. Returns `{ relevant, confidence, reasoning }` (Zod-validated).
4. **`src/commandHandler.ts`** — Parses `!`-prefixed commands sent to the bot's self-chat. Delegates multi-step flows to `wizardState.ts`.
5. **`src/dataStore.ts`** — Loads/saves `data/user_config.json`. Single source of truth for: interests, `commandChatId`, `notificationChatId`, group inclusion/exclusion lists, and direct-message toggle.
6. **`src/analyticsManager.ts`** — Collects in-memory metrics (messages analyzed, API latency, success/failure counts). Sends hourly POSTs to the landing page `/api/analytics` with JWT auth.

### Key Patterns

**LLM fail-over**: `llm/index.ts` registers providers based on which env vars are present and iterates through them in order on each call.

**Chat ID routing**: `commandChatId` (where commands are received) and `notificationChatId` (where filtered messages are forwarded) are stored in user config and default to the user's WhatsApp self-chat.

**Command wizard**: Multi-step group-selection flow uses `wizardState.ts` to track step and accumulated selections across separate `message_create` events.

**Group filtering**: Mutually exclusive inclusion/exclusion lists in user config. The interactive wizard lists group names by index for the user to select.

**ESM**: `core/` uses `"type": "module"` and compiles to ES2022. Use `import.meta.url` for `__dirname`/`__filename` equivalents.

### Landing Page

Next.js 15 App Router. Two API routes:
- `/api/auth` — issues a JWT used by the core bot
- `/api/analytics` — receives hourly metrics from running bot instances; writes to PostgreSQL (`src/utils/db.ts`)

### Mobile Server (`cd apps/mobile-server/`)

```bash
npm install
npm run dev          # tsx watch src/index.ts (port 4000)
npm start            # build + run dist/index.js
```

Required `.env` (copy from `.env.example`):
```env
DATABASE_URL=...     # Neon PostgreSQL connection string
JWT_SECRET=...       # Any long random string
OPENAI_API_KEY=...   # For LLM filtering
PORT=4000
```

Run migrations once against Neon: paste `src/db/migrations.sql` into the Neon SQL editor (or use psql). The SQL is safe to re-run — it drops and recreates all tables.

**Key architecture decisions:**
- **WhatsApp-as-identity**: no email/password. JWT is issued when WhatsApp pairing completes. `POST /api/whatsapp/init-link` is unauthenticated.
- **In-memory linking sessions**: `linkingSessions: Map<sessionId, LinkingEntry>` tracks short-lived pairing state. No DB table for this.
- **CJS import for whatsapp-web.js**: `import wwebjs from 'whatsapp-web.js'; const { Client, LocalAuth } = wwebjs;` — named ESM imports don't work with this CJS package.
- **Global Express.Request augmentation** in `src/middleware/auth.ts` so `req.userId` works without per-route casting.
- **`moduleResolution: "NodeNext"`** in tsconfig — not `"bundler"` (which is webpack/vite only).

### Mobile Client (`cd apps/mobile-client/`)

```bash
npm install --legacy-peer-deps
npx expo start       # Start Expo dev server; scan QR with Expo Go (SDK 54)
```

Set `EXPO_PUBLIC_API_URL` in `.env` (e.g. `http://<your-local-ip>:4000`).

**SDK**: Expo SDK 54, Expo Router v6, React Native 0.81.5. **Must use SDK 54** to match Expo Go on Play Store/App Store.

**Auth flow**: `link-whatsapp.tsx` → phone input → `POST /api/whatsapp/init-link` (unauthenticated) → show 8-char pairing code → poll `GET /api/whatsapp/link-status` → on `ready`, store JWT in SecureStore → navigate to feed.

**Auth guard pattern**: `_layout.tsx` blocks Stack rendering while `isLoading` (SecureStore read) is true. Tab screens also guard `if (!token) return` before API calls to prevent a flash-of-unauthenticated-request race.

**Current state (as of last session):** App scaffolding complete. WhatsApp linking flow UI built. End-to-end login (phone → pairing code → JWT → feed) not yet verified working. Feed, settings, and filter CRUD screens built but untested against live server.

---

## Commit Convention

Prefix commits with `feat`, `fix`, `refactor`, or `deploy` (per README contributing guidelines).
