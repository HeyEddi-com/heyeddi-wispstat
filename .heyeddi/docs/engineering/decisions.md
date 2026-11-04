# Engineering decisions

**Last updated:** 2026-11-02

Engineering ADRs: separate from the **Design Decision log** in `.heyeddi/design.md`.

## Template

```markdown
### YYYY-MM-DD: Title

**Context:** …
**Decision:** …
**Consequences:** …
```

### 2026-11-02: R2 optional on first production deploy

**Context:** Nightly CORE export needs an R2 bucket; Free accounts may not have R2 enabled, and missing buckets fail `wrangler deploy`.

**Decision:** Comment out `[[r2_buckets]]` by default; `scripts/setup.mjs` creates the bucket when possible and re-enables the binding. Cron nightly job already no-ops when `BACKUPS` is missing.

**Consequences:** First deploy is D1+KV+Worker only. Ops backups stay Time Travel until R2 is wired.

### 2026-11-02: Setup patches real resource IDs

**Context:** Placeholder UUIDs in `wrangler.toml` cannot deploy to a real account.

**Decision:** `npm run setup` creates D1/KV (and optional R2), rewrites `database_id` / KV `id` in `wrangler.toml`, uploads secrets, migrates, builds, deploys.

**Consequences:** Operators must run setup in a logged-in terminal; agent shells block live deploy (local-first).
