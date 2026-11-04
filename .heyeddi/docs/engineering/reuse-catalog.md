# Reuse catalog

**Last updated:** 2026-11-02

Prefer these modules before adding new abstractions.

| Need | Reuse | Notes |
|------|-------|-------|
| Config / limits | `wispstat.config.ts` | Env parsing + defaults |
| Product naming | `branding.config.ts` | Rename-safe strings |
| Site ID / normalize | `src/lib/utils.ts` | Crockford IDs, path/UTM/lang |
| Visitor hash | `src/lib/visitor.ts` + `src/lib/salt.ts` | Daily salt in KV |
| Channel grouping | `src/lib/channels.ts` + `channels.json` | UTM + referrer |
| Auth gate | `src/api/access.ts` | Principal + CSRF + site ACL |
| Rollup queries | `src/api/queries.ts` | Ranges, breakdowns, export |
| Partitions | `src/lib/partitions.ts` | `ev_` / `vis_` day tables |
| Rate limits | `src/lib/ratelimit.ts` | Soft shed before Free caps |
