# Production deploy — HeyEddi Wispstat

**Date:** 2026-11-03

Live Cloudflare create/deploy commands are blocked in agent shells (local-first). Run these in **your** terminal.

## Prerequisites

- Cloudflare account (Free tier is enough)
- Node 18+
- Logged in: `npx wrangler login`

## Pre-deploy ritual (every release)

```bash
cd heyeddi-wispstat
npm ci && (cd dashboard && npm ci) && (cd tracker && npm ci) && (cd mcp && npm ci)
npm run predeploy          # typecheck + vitest + build + secrets + mcp syntax
# CI equivalent without wrangler login:
# npm run predeploy -- --skip-secrets
```

After deploy (or against an existing Worker):

```bash
# Public surface (always)
npm run smoke -- https://<worker>.workers.dev

# Deep path (optional env)
SMOKE_EMAIL=you@example.com SMOKE_PASSWORD='…' \
SMOKE_DOMAIN=yourdomain.com \
WISPSTAT_API_KEY=wsk_s_…_… \
  npm run smoke -- https://<worker>.workers.dev

# MCP-equivalent HTTP + mcp/src syntax
WISPSTAT_BASE_URL=https://<worker>.workers.dev \
WISPSTAT_API_KEY=wsk_s_…_… \
  npm run smoke:mcp
```

`npm run check:secrets` alone verifies `SETUP_TOKEN`, `SESSION_SECRET`, and `TOKEN_KEY` are set on the Worker (`CHECK_SECRETS_STRICT=1` also requires `CF_*`).

## One-shot (create resources + secrets + migrate + deploy)

```bash
cd heyeddi-wispstat
npm install
cd dashboard && npm install && cd ..
cd tracker && npm install && cd ..
npm run setup
```

Save the printed `SETUP_TOKEN`. Open the `*.workers.dev` URL → claim → add a site → paste `ws.js` snippet.

## Prepare only (no deploy)

```bash
npm run setup:prepare   # D1 + KV IDs into wrangler.toml, secrets, migrate, build
npm run predeploy       # local gate
npx wrangler deploy     # you run this
npm run smoke -- https://heyeddi-wispstat.<account>.workers.dev
```

## Demonstrate on production

1. Claim with `SETUP_TOKEN`
2. Add site with your real domain (must match page Origin; suffix matching covers subdomains)
3. Install snippet:
   ```html
   <script defer src="https://<worker>/ws.js" data-site="s_…"></script>
   ```
4. Load the site → Visits / Heatmaps / Live; Summary after hourly rollup
5. Create a read key in Settings → point MCP (`mcp/`) at `WISPSTAT_BASE_URL` + `WISPSTAT_API_KEY`

## Optional later

- R2 backups: `npx wrangler r2 bucket create wispstat-backups` then uncomment `[[r2_buckets]]` in `wrangler.toml` and redeploy
- Custom domain + Cache API: Cloudflare dashboard → Workers → Triggers → Custom Domains
- Auth is local only (email/password at claim)
