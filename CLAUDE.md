# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp AI Filter is a monorepo with two applications:
- **`core/`** — Node.js/TypeScript bot that monitors WhatsApp groups and uses AI to filter messages based on user interests
- **`landing-page/`** — Next.js marketing website with a PostgreSQL-backed analytics API

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

## Commit Convention

Prefix commits with `feat`, `fix`, `refactor`, or `deploy` (per README contributing guidelines).
