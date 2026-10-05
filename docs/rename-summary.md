# Rename to HeyEddi Wispstat - Summary

**Date:** 2026-10-05  
**Status:** Complete ✅

## Changes Applied

### Core Branding (`branding.config.ts`)
- `PRODUCT_NAME`: "HeyEddi Wispstat"
- `PACKAGE_NAME`: "heyeddi-wispstat"
- `TRACKER_GLOBAL`: "wispstat"
- `TRACKER_FILENAME`: "ws"
- `KEY_PREFIXES`: wsk_ (read), wss_ (server)
- `COOKIE_PREFIX`: __Host-ws_
- `DB_NAMES`: wispstat-core, wispstat-ingest
- `NAMESPACE_NAMES`: wispstat-salts, wispstat-backups

### Files Updated

**Configuration:**
- `package.json`: name → heyeddi-wispstat, description updated
- `wrangler.toml`: name → heyeddi-wispstat, database names updated
- `edgemetry.config.ts`: Added "HeyEddi Wispstat" to header comment

**Tracker:**
- `tracker/em.ts`: GLOBAL_NAME → 'wispstat', header updated
- `tracker/vite.config.ts`: name → 'wispstat', fileName → 'ws'

**Dashboard:**
- `dashboard/index.html`: title → "HeyEddi Wispstat"
- `dashboard/src/App.vue`: h1 → "HeyEddi Wispstat"

**Scripts:**
- `scripts/setup.mjs`: 
  - Console output → "HeyEddi Wispstat Setup"
  - Database names → wispstat-core, wispstat-ingest

**Documentation:**
- `README.md`: Complete rewrite with HeyEddi Wispstat branding
- `docs/spec-v0.2.md`: Added rename notice at top
- `docs/build-report.md`: Updated all references to Wispstat

## Tracker API Examples

**Before (EdgeMetrics):**
```html
<script defer src="https://instance/em.js" data-site="s_..."></script>
<script>
window.edgemetrics = window.edgemetrics || function(){...};
edgemetrics('pageview');
</script>
```

**After (Wispstat):**
```html
<script defer src="https://instance/ws.js" data-site="s_..."></script>
<script>
window.wispstat = window.wispstat || function(){...};
wispstat('pageview');
</script>
```

## API Key Format

**Before:** `emk_s_..._<secret>` (read), `ems_s_..._<secret>` (server)  
**After:** `wsk_s_..._<secret>` (read), `wss_s_..._<secret>` (server)

## Database Names

**Before:**
- edgemetrics-core
- edgemetrics-ingest
- edgemetrics-salts (KV)
- edgemetrics-backups (R2)

**After:**
- wispstat-core
- wispstat-ingest
- wispstat-salts (KV)
- wispstat-backups (R2)

## Commands

**Before:**
```bash
wrangler d1 create edgemetrics-core
wrangler d1 export edgemetrics-core --remote
```

**After:**
```bash
wrangler d1 create wispstat-core
wrangler d1 export wispstat-core --remote
```

## Verification

✅ **Typecheck:** PASSING  
✅ **Tests:** 31/31 PASSING  
✅ **Git:** Committed and pushed

## Notes

- All naming centralized via `branding.config.ts` as designed
- Future renames only require updating that one file
- No code logic changes, only naming
- Spec (v0.2) kept intact with note at top explaining rename
- Build report updated to reflect final name
