# Public launch checklist — Wispstat

**Date:** 2026-11-04  
**Goal:** Flip `HeyEddi-com/heyeddi-wispstat` to **public** and announce.

## Blockers (do first)

| # | Item | Owner |
|---|------|--------|
| 1 | Commit remaining work on `feat/wispstat-mvp` (large dirty tree) | Human + agent on request |
| 2 | Open PR → merge to `main` (CI green) | Human |
| 3 | Confirm prod Worker claimed; rotate `SETUP_TOKEN` if it ever leaked in chat/logs | Human |
| 4 | Tag release e.g. `v0.1.0` from `main` | Human |

## Repo polish (mostly done / in tree)

- [x] MIT `LICENSE`
- [x] `SECURITY.md` → `security@heyeddi.com`
- [x] README install + security pointer
- [x] Marketing `/` + `/docs` (incl. MCP) live
- [x] CI workflow (domain lint scoped to app code)
- [x] `CONTRIBUTING.md`
- [ ] GitHub **About**: homepage `https://wispstat.heyeddi.com`, topics e.g. `analytics`, `cloudflare-workers`, `privacy`, `d1`, `mit`
- [ ] Optional: GitHub Releases notes from tag

## Flip (human terminal — local-first)

```bash
# after main is green and tagged:
gh repo edit HeyEddi-com/heyeddi-wispstat \
  --visibility public \
  --homepage https://wispstat.heyeddi.com \
  --add-topic analytics \
  --add-topic cloudflare-workers \
  --add-topic privacy \
  --add-topic d1 \
  --add-topic mit
```

Confirm: https://github.com/HeyEddi-com/heyeddi-wispstat is public (no login wall).

## Announce

Use draft: [`announce-draft-2026-11-04.md`](announce-draft-2026-11-04.md).

Channels (pick what you use): X/LinkedIn, heyeddi.com note, HN “Show HN” optional later.

## After flip

1. Hard-refresh marketing; confirm GitHub / Docs / Open app links.
2. Watch security@ for mail.
3. Pin README Deploy button URL to the public repo.
