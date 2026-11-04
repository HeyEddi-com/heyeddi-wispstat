# HeyEddi Wispstat Build Report

**Date:** 2026-11-02  
**Scope:** Production path — stabilize WIP, local demo, deploy runbook  
**Status:** Local demo verified; production deploy requires `npx wrangler login` + `npm run setup` in a human terminal

## Verified locally (2026-11-02)

| Step | Result |
|------|--------|
| `npm test` | 45/45 pass |
| `npm run build` | dashboard + `ws.js` (gzip ~1.26KB tracker) |
| `npm run typecheck` | clean |
| Claim → create site → `POST /e` pv → Live | Live showed `pageviews: 1` |
| `npm run smoke -- http://localhost:8787` | health, config, CORS OK |

Local server: `npx wrangler dev --local --port 8787`

## Production

Agent shells block live `wrangler deploy` (HeyEddi local-first). Cloudflare account was **not authenticated** in this environment (`wrangler whoami` → not logged in).

Operator steps (see `docs/production-deploy.md`):

```bash
cd heyeddi-wispstat
npx wrangler login
npm run setup          # D1 + KV + secrets + migrate + build + deploy
npm run smoke -- https://heyeddi-wispstat.<account>.workers.dev
```

## What’s in the tree

- Single Worker: collector `/e`, attribution `/a`, local auth, `/api/v1`, cron rollups/digest/backup stubs
- Vue dashboard (claim, login, overview, site views)
- Uncommitted WIP on `feat/wispstat-mvp` (sessions, rate limit, attribution) — builds and tests green
- Setup script rewritten to patch real D1/KV IDs into `wrangler.toml` (`scripts/setup.mjs`)
- R2 optional (commented in `wrangler.toml` until bucket exists)

## Engineering docs

`.heyeddi/docs/engineering/{architecture,reuse-catalog,decisions}.md` initialized 2026-11-02.
