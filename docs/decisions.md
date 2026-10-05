# Architecture Decisions & Verification

This document tracks verification of assumptions from the spec and key architectural decisions.

## Verification Against Cloudflare Docs (2026-10-04)

### ✅ Verified Items from Spec Appendix A

All items in spec Appendix A were already verified on 2026-10-04 and cited with URLs. Key confirmations:

- **D1 Free Limits**: 100k rows written/day, 5M reads/day, 10 DBs, 500MB/DB ✅
- **Workers Free**: 100k requests/day account-wide, 10ms CPU/request, 5 cron triggers/account ✅
- **Deploy Button**: Supports Workers apps, auto-provisions bindings, migrations via deploy script ✅
- **Web Crypto**: PBKDF2, AES-GCM, SHA-256, getRandomValues, timingSafeEqual all supported ✅
- **Static Assets**: `not_found_handling: "single-page-application"` supported ✅
- **KV TTL**: `expirationTtl` supported ✅
- **Cache API**: Works on custom domains only ✅

### ⚠️ Items Requiring Additional Verification (Appendix B)

The following items from Appendix B need verification during development:

#### 1. Deploy Button Secret Generation
**Status**: Will implement SETUP_TOKEN requirement; secrets defined in `.dev.vars.example`
**Decision**: Require user to set SETUP_TOKEN during Deploy button flow

#### 2. PBKDF2 Iteration Count on Free Tier
**Status**: Default 100,000 iterations
**Plan**: Test during spike; if exceeds 10ms CPU, reduce iterations or prompt user to upgrade

#### 3. INSERT...WHERE NOT EXISTS Row Counting
**Status**: Needs runtime verification
**Plan**: Test in unit tests to confirm D1 counts 0 rows written when EXISTS check fails

#### 4. Workers Static Asset Request Billing
**Status**: Unclear if static asset requests count toward 100k/day limit
**Assumption**: They likely do; will monitor and document

#### 5. D1 Window Functions (LAG for Sessions)
**Status**: Sessions deferred to v1.1
**Note**: Will verify SQLite version supports window functions when implementing v1.1

#### 6. Intl.DateTimeFormat in workerd
**Status**: Assumed working
**Plan**: Test timezone handling in unit tests

## Architectural Decisions

### Single Worker Design
**Decision**: One Worker with four modules (collector, api, cron, assets) instead of separate Workers

**Rationale**:
- Deploy-to-Cloudflare button limitation: doesn't handle monorepos with multiple Workers
- Simpler for self-hosters: one deploy, one wrangler.toml
- Trade-off: Less isolation (collector has access to CORE DB)

**Mitigation**:
- Clear module boundaries in code
- Comprehensive tests
- API never exposes raw INGEST data except live endpoint

### Two D1 Databases
**Decision**: INGEST (raw, disposable) and CORE (config + rollups, backed up)

**Rationale**:
- Export blocks database ✅
- Separating allows CORE backup without blocking ingestion
- INGEST partitions dropped after ~3 days
- Clear retention policies per database

### Site ID Format
**Decision**: Public random ID `s_<16-char-base32>` instead of slug

**Rationale**:
- Prevents enumeration (slug would be guessable)
- Used in tracker, collector, API keys
- Slug remains for dashboard UX but never accepted by collector

### No Hard-Coded Domains
**Decision**: All URLs derived from request or config

**Rationale**:
- Self-hosted: each instance has own domain
- Tracker defaults to script origin
- CI lint test enforces this

### Auth Provider Interface
**Decision**: Pluggable auth with built-in local (email+password) and Firebase

**Rationale**:
- Self-hosters want simple setup (local auth)
- Eddi wants Firebase Auth
- Single interface supports both

## Technical Notes

### Rate Limiting
- Per-location, eventually consistent (permissive)
- Not accounting-grade; acts as damper
- Key by site_id and site_id+coarse-ip-hash

### Timezone Handling
- Each site has IANA timezone
- Local day computed via Intl.DateTimeFormat
- Salts keyed by local date
- v1.0 supports whole-hour offsets only

### Channel Grouping
- Precedence: utm_medium → utm_source → referrer host → Direct
- Mapping in channels.json (versioned)
- Applied at ingest time (non-retroactive)

### Write Budget
- Ceiling: ~50k pageviews/day at ppv=1.6
- Formula: 1 + (1/ppv) per pageview
- 5k overhead for rollups/partitions
- 10% headroom

## Open Items

### From Spec Q-N Questions
- Q-N4: PBKDF2 iterations → test during development
- Q-N5: Deploy button secrets → require manual SETUP_TOKEN entry
- Q-N6: Consented mode details → deferred to v1.4

## Migration Notes

### Schema Versioning
- CORE and INGEST have separate migration directories
- Schema version tracked in instance table
- Migrations run via wrangler before deploy
- Time Travel bookmarks taken before each migration
