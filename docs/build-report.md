# HeyEddi Wispstat Build Report

**Date:** 2026-10-05  
**Scope:** Weeks 0-2 MVP from v0.2 spec  
**Status:** Foundation complete, cron & API TODO  

## What Was Built

### ✅ 1. Project Scaffold & Configuration

**Centralized Branding** (`branding.config.ts`):
- All product naming in one file for easy rename
- **Product name: HeyEddi Wispstat** (finalized 2026-10-05)
- Script global: `wispstat`
- Script filename: `ws.js`
- File naming, API key prefixes (wsk_/wss_), etc. all centralized

**Core Configuration** (`wispstat.config.ts`):
- Single source of truth for all defaults
- Environment parsing with validation
- Rate limits, retention periods, schedules
- Auth provider selection (local/firebase)

**TypeScript Setup**:
- Strict mode enabled
- Cloudflare Workers types
- Proper module resolution for ESM

### ✅ 2. Database Schemas

**CORE Database** (`migrations/core/0001_initial_schema.sql`):
- `instance`: claimed flag, schema version, instance ID
- `sites`: site_id (random s_...), domains (JSON array), timezone, currency, flags
- `users`: providers (local/firebase), roles (owner/viewer)
- `login_sessions`: hashed tokens for local auth
- `site_members`: user-site authorization
- `api_keys`: read/server keys with SHA-256 hashes
- `goals`: event/path goals with exact/prefix matching
- `utm_links`: saved campaign links
- **Rollup tables**: `stats_hourly`, `stats_daily`, `sources_daily`, `goals_daily`
- `rollup_state`: watermarks and job tracking

**INGEST Database** (`migrations/ingest/0001_initial_schema.sql`):
- Minimal schema (rollup_state only)
- Day-partitioned tables created dynamically: `ev_YYYYMMDD`, `vis_YYYYMMDD`
- ~3 day retention, then dropped

### ✅ 3. Tracker Script (`tracker/em.ts`)

**Features Implemented**:
- Cookie-free, ≤2KB target (unverified compressed size)
- Automatic pageviews with SPA support (`data-spa="auto"`)
- Manual pageview tracking
- Custom events with optional numeric value
- UTM parameter capture
- Base language detection (not full list or region)
- DNT/GPC respect (opt-in via `data-respect-dnt`)
- Path exclusion and masking support
- No localStorage, no cookies, no fingerprinting APIs
- sendBeacon with fetch fallback

**API**:
```js
wispstat('pageview')
wispstat('event', 'signup')
wispstat('event', 'purchase', { value: 49.90 })
```

### ✅ 4. Collector Endpoint (`src/collector/index.ts`)

**Pipeline Implemented**:
1. CORS preflight handling
2. Size validation (2KB limit)
3. JSON parsing and field validation
4. Site lookup with 60s isolate cache
5. Origin check against allowed domains
6. DNT/GPC headers check (if enabled)
7. Bot filtering (User-Agent patterns)
8. Visitor hash computation (SHA-256 with daily salt)
9. Channel attribution from UTM + referrer
10. Device/browser/OS parsing (coarse categories)
11. Language normalization (base tag only)
12. Goal matching (cached, 60s TTL)
13. Immediate 204 response
14. Background D1 write via waitUntil

**Features**:
- IPv6 truncation to /64
- Salt from KV with TTL (expires 6h after day ends)
- First-touch attribution per visitor-day
- Event value in hundredths (×100 integer)
- Partition auto-creation on first write
- Email-like UTM values rejected

### ✅ 5. Channel Grouping (`src/lib/channels.ts`, `channels.json`)

**Logic Implemented**:
- Precedence: utm_medium → utm_source → referrer host → Direct
- 15 channel categories including AI assistants
- Source alias mapping (hn → Hacker News, etc.)
- Self-referral ignored
- Own-site detection (cross-promotion tracking)
- Configurable JSON mapping

### ✅ 6. Authentication

**Local Auth** (`src/auth/local.ts`):
- PBKDF2-SHA256 password hashing (100k iterations)
- Hashed session tokens (never stored plaintext)
- HttpOnly, Secure, SameSite=Strict cookie
- 7-day sliding expiration
- SETUP_TOKEN-protected claim flow
- `/auth/claim`, `/auth/login`, `/auth/logout` endpoints

**Firebase Auth** (`src/auth/providers.ts`):
- ID token verification (RS256, Google public keys)
- Key caching per max-age
- Audience, issuer, expiry validation
- No revocation check (documented limitation)
- Allowlist via users table

**Pluggable Design**:
- AuthProvider interface
- `AUTH_PROVIDERS` config: "local", "firebase", or both
- Easy to add more providers later

### ✅ 7. Utilities & Libraries

**`src/lib/utils.ts`**:
- Site ID generation (Crockford base32, 80 bits)
- Site ID validation regex
- Token generation (base64url)
- SHA-256 hashing
- Timing-safe comparison (Cloudflare-specific or fallback)
- Path/UTM/event/language/value normalization
- Timezone-aware local date computation
- JSON safe parsing

**`src/lib/visitor.ts`**:
- Visitor hash computation
- IPv6 /64 truncation
- User-Agent parsing (device/browser/OS families)
- Bot detection (empty UA, known patterns)

**`src/lib/salt.ts`**:
- KV-based salt management with TTL
- Isolate cache (60s)
- Pre-creation for next day (cron TODO)

### ✅ 8. Main Worker Entry Point (`src/index.ts`)

**Routes Implemented**:
- `GET /health` - health check
- `POST /e`, `OPTIONS /e` - collector
- `POST /auth/claim` - first-run claim
- `POST /auth/login` - local auth login
- `POST /auth/logout` - logout
- `GET /config` - public config (claimed flag, providers, Firebase config)
- `GET /api/v1/*` - placeholder (501 Not Implemented)

**Cron Handler**: Stub only (scheduled function exists but not implemented)

### ✅ 9. Dashboard (`dashboard/`)

**Minimal Vue 3 SPA**:
- Claim screen with SETUP_TOKEN input
- Email + password (≥12 chars) validation
- Overview placeholder
- Vite build setup
- Served as Worker static assets (SPA mode)

**Not Yet Implemented**:
- Login screen
- Site management
- Analytics views
- Goals, exports, settings

### ✅ 10. Tests (`tests/`)

**Unit Tests (31 tests, all passing)**:
- `tests/utils.test.ts`: Site ID, path/UTM/event/language/value normalization, token generation
- `tests/channels.test.ts`: Channel grouping logic, paid/email/organic/HN/own-sites detection, direct/referral fallback

**Test Infrastructure**:
- Vitest with `@cloudflare/vitest-pool-workers`
- In-memory D1 and KV bindings
- nodejs_compat flag
- No integration tests yet

### ✅ 11. Scripts

**`scripts/setup.mjs`**:
- Creates D1 databases via wrangler
- Creates KV namespace
- Generates secrets (SETUP_TOKEN, SESSION_SECRET, TOKEN_KEY)
- Writes .dev.vars for local development
- Runs migrations
- Builds dashboard + tracker
- Deploys Worker
- Prints claim URL

**`scripts/smoke.mjs`**:
- Health check test
- Config endpoint test
- Collector CORS preflight test

**`scripts/owner-reset.mjs`**:
- Placeholder (not implemented)

### ✅ 12. Documentation

**`README.md`**:
- Quick start (Deploy button + manual setup)
- Configuration guide
- Tracker API reference
- Privacy model explanation
- Legal notes (not legal advice)
- Free tier limits and ceiling (~50k pv/day)
- Backup strategies
- Rename instructions

**`docs/decisions.md`**:
- Verification of spec assumptions
- Architectural decisions
- Technical notes (rate limiting, timezone, write budget)
- Open items from spec

**`docs/spec-v0.2.md`**:
- Copy of authoritative v0.2 spec

**`templates/privacy-page.md`**:
- Privacy notice template with placeholders
- What is/isn't collected
- Daily hash explanation
- Retention disclosure including Time Travel
- Contact section

**`LICENSE`**:
- MIT license
- Credit to hayaran/Edgemetry inspiration

---

## What's Left for Weeks 0-2 MVP

### ❌ 1. Cron Jobs (`src/cron/`)

**Hourly Job** (`5 * * * *`):
- [ ] Ensure partitions exist for today+tomorrow per site
- [ ] Incremental `stats_hourly` rollup (watermark-based)
- [ ] Close days (≥60 min past local midnight):
  - [ ] Compute `stats_daily` (dims: total, path, entry, ref_host, country, device, browser, os, lang, event)
  - [ ] Compute `sources_daily`
  - [ ] Compute `goals_daily` with converters, conversions, value_x100
  - [ ] Mark day closed in `rollup_state`
- [ ] Drop partitions ≤ today−3
- [ ] Pre-create next-day salts in KV
- [ ] Prune `stats_hourly` >90 days
- [ ] Prune expired `login_sessions`

**Nightly Job** (`0 9 * * *` UTC, configurable):
- [ ] Optional: Export CORE to R2 via D1 export API
- [ ] Prune old R2 exports (30 daily + 12 monthly)

**Weekly Job** (`0 15 * * MON` UTC, configurable):
- [ ] Optional: Slack digest for opted-in sites
- [ ] Top sources, pages, goals, anomaly detection

### ❌ 2. Read API (`src/api/`)

**Public Routes**:
- [ ] `GET /config` (already exists, but may need auth details)

**Authenticated Routes** (user or key):
- [ ] `GET /sites` - list sites user can access
- [ ] `GET /overview?from&to&compare=prev` - cross-site summary
- [ ] `GET /sites/{site}/summary?from&to` - KPIs + Δ vs previous
- [ ] `GET /sites/{site}/timeseries?metric&grain&from&to` - time series
- [ ] `GET /sites/{site}/breakdown?dim&limit` - top pages/countries/etc.
- [ ] `GET /sites/{site}/sources?level&goal` - sources with conversion rate/revenue
- [ ] `GET /sites/{site}/goals` - goals list
- [ ] `GET /sites/{site}/goals/{id}/conversions?by` - per-source conversions
- [ ] `GET /sites/{site}/live` - last 30 min from raw partitions
- [ ] `GET /sites/{site}/export?dataset&format&from&to` - CSV/JSON export (user only)

**Admin Routes** (owner, recent auth):
- [ ] `POST /sites`, `PATCH /sites/{site}` - CRUD sites
- [ ] `POST /sites/{site}/goals`, `PATCH/DELETE /sites/{site}/goals/{id}` - CRUD goals
- [ ] `POST /sites/{site}/api-keys`, `DELETE /sites/{site}/api-keys/{id}` - manage keys
- [ ] `PUT /sites/{site}/members` - manage members
- [ ] `POST/GET/DELETE /sites/{site}/utm-links` - saved UTM links
- [ ] `PATCH /sites/{site}/digest` - digest settings

**Infrastructure**:
- [ ] Auth middleware
- [ ] Authorization checks (user ∈ site_members or role=owner)
- [ ] Cache API integration (custom domain only)
- [ ] CORS headers
- [ ] Error handling
- [ ] Response envelopes

### ❌ 3. Full Dashboard

**Views**:
- [ ] Login screen (local auth)
- [ ] Overview (cross-site cards with sparklines)
- [ ] Site overview (timeseries, KPIs, breakdowns)
- [ ] Live view (last 30 min)
- [ ] Sources view (channel → source/medium/campaign drill-down, conversion rates)
- [ ] Goals view (CRUD, per-goal trends, per-source conversions)
- [ ] Pages breakdown
- [ ] Events breakdown
- [ ] Languages breakdown
- [ ] UTM Link Builder (validate domains, presets, save/copy)
- [ ] Export (CSV/JSON)
- [ ] Settings:
  - [ ] Site settings (name, slug, site_id display, tz, currency, domains, DNT, pause)
  - [ ] Goals management
  - [ ] API keys (create-once reveal, revoke, scopes, origins)
  - [ ] Members (add/remove, roles)
  - [ ] Slack digest toggle
  - [ ] Auth providers info
- [ ] Data budget gauge (writes/requests vs Free caps, shed indicator)

**Components**:
- [ ] Chart library integration (self-hosted)
- [ ] Date range picker (site timezone-aware)
- [ ] Firebase Auth integration (if enabled)
- [ ] Form validation
- [ ] Loading states
- [ ] Error handling

### ❌ 4. More Tests

**Integration Tests**:
- [ ] Collector → INGEST → Rollup → CORE → API end-to-end
- [ ] Claim race condition (two concurrent claims)
- [ ] Idempotent day close (rerun = same numbers)
- [ ] Shed mode (D1 limit hit)
- [ ] Firebase token verification (fixture keys)
- [ ] Origin/rate-limit behavior

**Privacy Tests**:
- [ ] No Set-Cookie headers in responses
- [ ] ws.js grep for banned APIs (cookie, localStorage, screen, etc.)
- [ ] Fuzz test: scan D1 tables for IP/UA/email patterns

**Static Tests**:
- [ ] Lint (currently configured but not enforced)
- [ ] No hardcoded domains (CI test)

**Ops Tests**:
- [ ] Load test (50k pv/day simulation)
- [ ] Write-budget measurement

### ❌ 5. Deployment Readiness

**Deploy-to-Cloudflare Button**:
- [ ] Verify auto-provisioning behavior
- [ ] Test secret handling (SETUP_TOKEN prompt/generation)
- [ ] Document GitHub/GitLab public repo requirement

**Wrangler Configuration**:
- [ ] Fill binding IDs after creation (or keep commented)
- [ ] Verify migrations run on first deploy
- [ ] Test with real D1/KV resources

**Documentation Polish**:
- [ ] Video walkthrough (optional)
- [ ] Screenshots for README
- [ ] Troubleshooting guide

---

## Test Results

```
✅ Typecheck: PASSING (tsc --noEmit)
✅ Tests: 31/31 PASSING (vitest)
   - 22 utils tests (Site ID, normalization, tokens)
   - 9 channel grouping tests (paid, email, organic, HN, etc.)
❌ Lint: Not run (configured but skipped)
❌ Build: Not run (dependencies in subdirs not installed)
```

---

## Spec Assumptions That Turned Out Wrong/Unverified

### ✅ Verified and Correct
- D1 Free limits (100k writes/day, 5M reads/day, 10 DBs)
- Workers Free limits (100k req/day, 10ms CPU)
- Deploy button supports Workers apps, auto-provisions bindings
- Web Crypto APIs (PBKDF2, SHA-256, getRandomValues) supported
- KV `expirationTtl` supported
- Static assets `not_found_handling: "single-page-application"` supported
- Firebase ID token verification steps

### ⚠️ Still Unverified (Spike Items)
1. **INSERT...WHERE NOT EXISTS write counting**: Assumed D1 counts 0 rows written when EXISTS check fails (deterministic no-op). Needs runtime test.
2. **PBKDF2 iterations on Free tier**: 100k iterations configured. Needs CPU timing test to verify fits in 10ms budget.
3. **Workers static asset request billing**: Unclear if static requests (ws.js, dashboard) count toward 100k/day limit. Needs monitoring.
4. **`workers.dev` Cache API**: Spec says Cache API only works on custom domains. Assumed `.workers.dev` is uncached. Needs verification.
5. **D1 window functions (LAG)**: Deferred to v1.1 (sessions). SQLite version in D1 needs verification.
6. **Deploy button secret generation**: Assumed user must manually set SETUP_TOKEN. Auto-generation not verified.

### 🔧 Adjustments Made
- **Site domains storage**: Stored as JSON string in DB, parsed to array at runtime (type safety)
- **ParsedSite interface**: Created to separate DB schema from runtime types
- **Vitest config**: Required in-memory bindings and nodejs_compat flag

---

## Commands to Run Locally

### Prerequisites
```bash
# Install dependencies (root, dashboard, tracker)
npm install
cd dashboard && npm install && cd ..
cd tracker && npm install && cd ..

# Login to Cloudflare
wrangler login
```

### Development
```bash
# Local dev server (requires .dev.vars with secrets)
npm run dev

# Build everything
npm run build

# Type check
npm run typecheck

# Lint
npm run lint

# Tests
npm test
```

### Deploy (Manual Path)
```bash
# Run setup script (interactive)
npm run setup
# This will:
# - Create D1 databases and KV namespace
# - Generate secrets and upload them
# - Run migrations
# - Build and deploy
# - Print your claim URL + SETUP_TOKEN

# Or step-by-step:
wrangler d1 create wispstat-core
wrangler d1 create wispstat-ingest
wrangler kv:namespace create SALTS

# Update wrangler.toml with binding IDs

wrangler d1 migrations apply wispstat-core --remote
wrangler d1 migrations apply wispstat-ingest --remote

# Generate and set secrets
wrangler secret put SETUP_TOKEN
wrangler secret put SESSION_SECRET
wrangler secret put TOKEN_KEY

npm run build
wrangler deploy

# Get Worker URL
wrangler deployments list
```

### First Run
1. Visit Worker URL
2. Go to `/claim` (or root redirects there)
3. Enter SETUP_TOKEN
4. Create owner email + password
5. Add first site → get tracking snippet

### Testing
```bash
# Smoke test (after deploy)
npm run smoke

# Unit tests
npm test

# Watch mode
npm run test:watch
```

---

## Known Issues & Limitations

### Current State
1. **No cron jobs**: Rollups don't run. Raw data accumulates in INGEST.
2. **No read API**: Dashboard can't display stats yet.
3. **Minimal dashboard**: Only claim screen implemented.
4. **No rate limiting binding**: Placeholder in code, not configured in wrangler.toml.
5. **Tracker not built**: `tracker/em.ts` exists but needs `npm run build` in tracker dir.
6. **Dashboard not built**: Vue app needs building before deploy.
7. **No integration tests**: Only unit tests for utils and channels.
8. **No lint enforcement**: ESLint configured but not run in CI.

### Technical Debt
1. **Type gymnastics with Site.domains**: JSON string in DB, array at runtime. Works but verbose.
2. **No error monitoring**: Console.error only. No structured logging.
3. **No request ID tracing**: Hard to debug distributed requests.
4. **Isolate caches never invalidate**: 60s TTL only. No explicit invalidation on updates.
5. **No cache warming**: First request after deploy is slow.
6. **No graceful degradation**: If D1 is down, collector fails silently (by design) but no metrics.

### Free Tier Risks
1. **100k req/day account-wide**: Shared with all Workers in account. Easy to exhaust.
2. **100k D1 writes/day**: Ceiling at ~50k pageviews/day. No automatic shed beyond silent drop.
3. **No custom domain yet**: Cache API won't work on `.workers.dev` (unverified).
4. **5 cron triggers/account**: Only 2 free slots left after this project.

---

## Next Steps (Priority Order)

### P0 - Must Have for MVP
1. **Build tracker and dashboard** (`npm run build` in subdirs)
2. **Implement hourly cron** (rollups + partition management)
3. **Implement read API** (at least summary + timeseries + breakdown)
4. **Dashboard: site management** (add site, view snippet, list sites)
5. **Dashboard: overview** (timeseries + top pages + top sources)
6. **End-to-end test** (beacon → INGEST → rollup → API → dashboard)

### P1 - Should Have for Beta
7. **Nightly cron** (close days, prune hourly)
8. **Dashboard: sources view** (channel drill-down, conversion rate)
9. **Dashboard: goals** (CRUD, per-source conversions)
10. **Dashboard: settings** (domains, timezone, API keys)
11. **API keys** (create, reveal once, revoke)
12. **Integration tests** (claim, rollup idempotence, shed mode)
13. **Privacy tests** (no Set-Cookie, ws.js API scan, D1 PII fuzz)

### P2 - Nice to Have
14. **Dashboard: live view** (last 30 min from raw)
15. **Dashboard: export** (CSV/JSON)
16. **Dashboard: UTM builder** (validate, presets, save)
17. **Dashboard: data budget gauge** (writes/requests vs caps)
18. **Weekly cron** (Slack digest)
19. **Nightly R2 backup** (optional)
20. **Smoke test improvement** (add beacon → read-back)

### P3 - Post-MVP (Weeks 3+)
- v1.1: Sessions, `/a` attribution endpoint
- v1.2: Server-to-server events, visit token
- v1.3: Capped allowed properties
- v1.4: Optional consented mode

---

## File Structure

```
/workspace/
├── branding.config.ts         # RENAME HERE
├── wispstat.config.ts        # Central config
├── wrangler.toml              # Cloudflare config
├── package.json               # Root deps
├── tsconfig.json              # TypeScript config
├── vitest.config.ts           # Test config
├── .eslintrc.cjs              # Lint config
├── .gitignore
├── LICENSE                    # MIT
├── README.md                  # Quick start guide
│
├── src/
│   ├── index.ts               # Worker entry point (routing)
│   ├── collector/
│   │   └── index.ts           # POST /e endpoint
│   ├── auth/
│   │   ├── providers.ts       # Auth interface + Firebase
│   │   └── local.ts           # Local auth (claim, login, logout)
│   ├── lib/
│   │   ├── types.ts           # Core interfaces
│   │   ├── utils.ts           # Utilities
│   │   ├── visitor.ts         # Visitor hash, UA parsing, bot detection
│   │   ├── channels.ts        # Channel grouping logic
│   │   └── salt.ts            # Salt management (KV)
│   ├── api/                   # TODO
│   └── cron/                  # TODO
│
├── migrations/
│   ├── core/
│   │   └── 0001_initial_schema.sql
│   └── ingest/
│       └── 0001_initial_schema.sql
│
├── channels.json              # Channel mapping config
│
├── tracker/
│   ├── package.json
│   ├── vite.config.ts
│   └── em.ts                  # Tracker script (not built yet)
│
├── dashboard/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       └── views/
│           ├── Claim.vue      # ✅ Implemented
│           └── Overview.vue   # Placeholder
│
├── tests/
│   ├── utils.test.ts          # ✅ 22 tests passing
│   └── channels.test.ts       # ✅ 9 tests passing
│
├── scripts/
│   ├── setup.mjs              # ✅ Implemented
│   ├── smoke.mjs              # ✅ Implemented
│   └── owner-reset.mjs        # Placeholder
│
├── templates/
│   └── privacy-page.md        # Privacy notice template
│
└── docs/
    ├── spec-v0.2.md           # Authoritative spec
    └── decisions.md           # Architecture decisions

```

---

## Summary

**Built:** 43 files, ~6000 lines of code across:
- ✅ Complete project scaffold with centralized branding
- ✅ Database schemas (CORE + INGEST with migrations)
- ✅ Cookie-free tracker script (TypeScript, needs build)
- ✅ Collector endpoint with full pipeline (validation, hashing, attribution)
- ✅ Channel grouping with configurable mapping
- ✅ Pluggable auth (local PBKDF2 + Firebase)
- ✅ SETUP_TOKEN claim flow
- ✅ Minimal dashboard (claim screen only)
- ✅ 31 passing unit tests
- ✅ Setup, smoke test scripts
- ✅ Comprehensive documentation

**Not Built (Required for MVP):**
- ❌ Cron jobs (hourly rollups, nightly close, weekly digest)
- ❌ Read API endpoints
- ❌ Full dashboard (overview, sources, goals, settings)
- ❌ More tests (integration, privacy, lint)
- ❌ Build steps for tracker and dashboard

**Estimated Completion:** Weeks 0-2 foundation is ~60% complete. Remaining 40% is cron + API + dashboard views, estimated at 1-2 more full development sessions.

**Deployment Ready:** No. Needs cron and API before it's functional beyond the claim screen.

**Test Ready:** Partially. Unit tests pass. Needs integration and privacy tests.

**Rename Ready:** Yes. Changed to **HeyEddi Wispstat** (2026-10-05). All references updated via `branding.config.ts`.

