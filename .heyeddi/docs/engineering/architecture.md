# Architecture

**Last updated:** 2026-11-02

Privacy-first, cookie-free web analytics on a single Cloudflare Worker (D1 + KV + static assets).

## Stack

| Piece | Choice |
|-------|--------|
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| HTTP | Hono |
| Data | D1 `CORE` (config/rollups/users) + D1 `INGEST` (day partitions) + KV `SALTS` |
| Optional | R2 `BACKUPS` (nightly CORE export) |
| Tracker | Vite IIFE `ws.js` (≤~2KB gzip target) |
| Dashboard | Vue 3 SPA served as Worker assets |

## Module map

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Entry | `src/index.ts` | Routes, cron hook, asset fallback |
| Collector | `src/collector/` | `POST /e` ingest, `POST /a` attribution |
| Auth | `src/auth/` | Local claim/login only |
| API | `src/api/` | `/api/v1` read + admin |
| Cron | `src/cron/` | Hourly rollups, nightly backup |
| MCP | `mcp/` | Thin stdio agent access via read API key |
| Lib | `src/lib/` | Types, salts, visitor hash, channels, partitions |
| Tracker | `tracker/ws.ts` | Browser beacon |
| Dashboard | `dashboard/src/` | Claim, login, site analytics UI |
| Config | `wispstat.config.ts`, `branding.config.ts` | Defaults + naming |

## Data flow

1. Site loads `ws.js` → `POST /e` pageview/event (no cookies)
2. Collector validates site/origin → visitor hash (daily salt) → writes INGEST partition via `waitUntil`
3. Hourly cron rollups INGEST → CORE (`stats_*`, `sources_daily`, `goals_daily`)
4. Dashboard / API keys read CORE (+ live window from INGEST)

## Boundaries

- Collector never stores raw IP/UA; salts expire; no Set-Cookie on `/e`
- Views stay thin; query logic lives in `src/api/queries.ts`
- Nightly R2 + Slack digest are opt-in (skip if secrets/bindings missing)

## What not to build

No multi-tenant SaaS, no fingerprinting, no session replay, no third-party calls from the tracker. See `reuse-catalog.md` and `docs/spec-v0.2.md`.
