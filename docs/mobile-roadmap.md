# Mobile App Roadmap

This document is the persistent product and engineering roadmap for the WhatsApp AI Filter mobile experience. Update it as decisions are made and phases complete.

---

## 1. What Ships Tonight (v1 MVP)

### Architecture
- **`apps/mobile-server/`** — Centralized multi-tenant Express + TypeScript server. Each user's WhatsApp session runs server-side via `whatsapp-web.js`. WhatsApp linking uses **phone number pairing code** (no QR scan needed on mobile).
- **`apps/mobile-client/`** — Expo (managed) React Native app.

### Features
- Email + password registration and login (JWT, 30-day expiry)
- Three preset filters seeded on registration: *Action Items*, *Follow-ups*, *Events in San Francisco*
- Create custom named filters with a prompt, category (personal/work/all), DM toggle, and optional group-scoping rules
- Link WhatsApp via phone number → 8-character pairing code flow
- Feed screen: all filter matches, most recent first, full message content shown inline
- Settings screen: filter list with active toggle; WhatsApp link status and re-link button

### Privacy posture (v1)
- Message content stored in plaintext `content TEXT` column for MVP simplicity
- No message content is persisted that the user did not explicitly choose to filter
- Migration to encrypted storage planned in Phase 2 (see §5)

### Database
PostgreSQL via Neon. Schema: `users`, `filters`, `filter_group_rules`, `whatsapp_sessions`, `filter_matches`.

### Stack
| Layer | Technology |
|-------|-----------|
| Server | Express 4, TypeScript, tsx dev runner |
| ORM/DB | `pg` (node-postgres) direct queries |
| Auth | bcryptjs + jsonwebtoken |
| WhatsApp | whatsapp-web.js + Puppeteer (per-user headless Chromium) |
| LLM | Perplexity Sonar (primary), OpenAI GPT-4o-mini (fallback) |
| Mobile | Expo SDK (managed), Expo Router, Zustand + SecureStore |

---

## 2. Scaling Path

### Immediate bottleneck: Puppeteer memory
`whatsapp-web.js` spawns a headless Chromium per user (~150 MB each). Acceptable for ≤10 concurrent users during private beta.

### Baileys migration (target: Phase 2)
Replace `whatsapp-web.js` with [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys):
- Pure TypeScript WebSocket implementation of the WhatsApp multi-device protocol
- No Puppeteer / no headless browser — ~5 MB per session vs ~150 MB
- Same layer used by Beeper's `mautrix-whatsapp`
- Breaking changes: auth storage format changes; session migration required

**Migration steps:**
1. Implement `BaileysAdapter` behind a `WhatsAppAdapter` interface used by `sessionManager.ts`
2. Feature-flag new registrations to Baileys; keep existing Puppeteer sessions alive
3. One-time migration script to re-auth existing users via new pairing code
4. Remove `whatsapp-web.js` and Puppeteer dependencies

### Horizontal session sharding
- Each server node owns a subset of user sessions (consistent-hash by `userId`)
- Node discovery via Redis Pub/Sub or a lightweight Kubernetes service mesh
- Session state (auth creds) stored in a shared object store (S3-compatible) so any node can restore
- Sticky routing for HTTP requests: API gateway routes user → owning node

### Database
- Add read replicas for the `filter_matches` table (high read volume)
- Partition `filter_matches` by `received_at` month for query performance at scale
- Add covering index: `(user_id, filter_id, received_at DESC)` for filtered feed queries

---

## 3. Repo Restructure

Current repo has `core/` (single-user PM2 bot) and `landing-page/`. Adding `apps/mobile-server/` and `apps/mobile-client/` as siblings.

**Target monorepo layout:**
```
packages/
  engine/              # Shared filter/LLM logic (extracted from core + mobile-server)
  whatsapp-web-adapter/  # whatsapp-web.js wrapper implementing WhatsAppAdapter
  baileys-adapter/       # Baileys implementation of same interface
apps/
  core/                # Existing single-user bot (consumes packages/engine)
  mobile-server/       # Multi-tenant server
  mobile-client/       # Expo app
  landing-page/        # Next.js marketing site
```

**Steps:**
1. Define `WhatsAppAdapter` interface and `FilterEngine` interface in `packages/`
2. Extract `core/src/llm/` → `packages/engine/src/llm/`
3. Wrap `whatsapp-web.js` in `packages/whatsapp-web-adapter/`
4. Update `core/` and `mobile-server/` to consume packages
5. Configure npm/pnpm workspaces and shared `tsconfig.base.json`

---

## 4. Phase 2 Features

- **Personal / Work tabs** — Schema already has `category` column on `filters`. Split feed into tabs once user base validates demand.
- **Push notifications** — APNs (iOS) + FCM (Android) via Expo Notifications. Server pushes when a high-confidence match arrives; client shows rich notification with sender + group name.
- **DM cross-tab** — DMs matching a "work" filter surface in Work tab; DMs matching "personal" surface in Personal tab.
- **In-depth filter UI** — Visual rule builder (AND/OR conditions), test-against-message sandbox, filter performance stats (match rate, false-positive rate via user feedback).
- **More preset filters** — "Job opportunities", "Price drops / deals", "Travel plans", user-contributed preset library.
- **Group management** — In-app group list with per-group filter assignment; bulk enable/disable.

---

## 5. Privacy Upgrade (pick one path before public launch)

### Option B — E2E encrypted storage
1. On registration, generate a 256-bit AES key on the device; store in `SecureStore`.
2. Before inserting a `filter_matches` row, client-side encrypt `content` → `content_encrypted BYTEA`.
3. Server stores only ciphertext; cannot read message content.
4. Feed: server returns `content_encrypted`; client decrypts with local key.
5. **Migration**: add `content_encrypted` column, backfill NULL (existing rows have no key — discard or prompt re-auth), drop `content TEXT`.
6. **Trade-off**: no server-side search or cross-device sync without key backup (add iCloud/Google Drive key backup flow).

### Option C — Push + no persistent storage (cleanest)
1. Add APNs/FCM. Server processes match, sends push payload containing full message content.
2. Client receives push, caches in `AsyncStorage` (local device only).
3. Server **never writes `content`** to DB — `filter_matches` stores only metadata.
4. Feed comes from local `AsyncStorage` cache, not API.
5. **Trade-off**: no historical feed on new device install; messages lost if app uninstalled.
6. **Advantage**: stateless server, zero content liability, simplest compliance posture.

**Recommendation**: Ship Option B for users who want cross-device history; provide Option C as a "privacy mode" toggle.

---

## 6. Monetization

### Model
- **24-hour free trial** on registration (all features unlocked)
- **Subscription** after trial: monthly or annual via App Store / Play Store In-App Purchase

### Implementation
- **RevenueCat** SDK in mobile client for cross-platform IAP + receipt validation
- Server-side entitlement check: `GET /api/entitlement` calls RevenueCat REST API and caches result (TTL 1 hour)
- After trial: `/api/messages` and filter processing gate on entitlement; return `402 Payment Required` with deep-link to paywall
- **Grace period**: 3-day grace after subscription lapses; show banner but don't hard-block

### Pricing ideas (TBD with data)
| Plan | Price | Limits |
|------|-------|--------|
| Free trial | $0 | 24 hours, all features |
| Pro Monthly | $4.99/mo | Unlimited filters, unlimited matches |
| Pro Annual | $39.99/yr | Same; ~33% discount |

---

## 7. Creator Analytics

### Events to track
| Event | When |
|-------|------|
| `registration` | User registers |
| `wa_linked` | WhatsApp pairing succeeds |
| `filter_created` | User creates a custom filter |
| `message_processed` | LLM called for a message |
| `filter_match` | LLM returns relevant=true |
| `trial_started` | Free trial begins |
| `subscribed` | IAP confirmed |
| `churned` | Subscription lapses |

### Schema addition
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  properties JSONB,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_type_time ON events(event, occurred_at DESC);
```

### Tooling options
- **PostHog** (self-hosted or cloud) — funnel analysis, retention cohorts, feature flags
- **Simple Next.js admin page** — query DB directly; show daily signups, active sessions, match counts
- **Retool** — low-code dashboard over Neon; fastest to ship

**Recommendation**: PostHog cloud (generous free tier) + a minimal Retool dashboard for subscription metrics.

---

## 8. Design Improvements

| Area | Work |
|------|------|
| Onboarding | Illustrated 3-step onboarding (link WA → create filter → see feed) shown on first launch |
| Empty states | Feed empty state with prompt to create a filter or check link status |
| Dark mode | Respect system `colorScheme`; use Expo's `useColorScheme`; dark palette TBD |
| Haptics | `expo-haptics` on filter match received (light impact), on swipe-to-read (medium) |
| Message card | Sender avatar (first letter initials); truncated reasoning with expand chevron; swipe-right to mark read |
| Filter creation | Live preview: paste a sample message and see if the current prompt would match it |
| Accessibility | Minimum 44pt touch targets; `accessibilityLabel` on all interactive elements; VoiceOver tested |

---

## Deferred (explicitly out of scope for v1)

- Personal / Work tab split (schema ready; deferred pending UX validation)
- Push notifications (APNs / FCM)
- Migrate whatsapp-web.js → Baileys
- Repo restructure + engine extraction
- E2E message content encryption
- Paywall / RevenueCat integration
- Creator analytics dashboard
- Group management UI
- Filter performance stats
