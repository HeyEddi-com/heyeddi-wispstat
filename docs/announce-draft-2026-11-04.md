# Announce draft — Wispstat public

**Date:** 2026-11-04  
**Status:** Ready to post after repo is public + `main` tagged.

## Short (X / LinkedIn)

HeyEddi Wispstat is open source (MIT).

Cookie-free web analytics on your Cloudflare Workers — self-hosted, ~2KB tracker, no field values on form submits. Dashboard + share links + MCP for agents.

Site: https://wispstat.heyeddi.com  
Repo: https://github.com/HeyEddi-com/heyeddi-wispstat  
Docs: https://wispstat.heyeddi.com/docs

## GitHub Release (`v0.1.0`)

### HeyEddi Wispstat v0.1.0

Privacy-first, cookie-free analytics that runs entirely on **your** Cloudflare account (Workers + D1 + KV).

- Cookie-free visitor days (rotating salts)
- Tracker ≈2KB; SPA-aware; forms never send field values
- Dashboard: overview, sources, goals, visits, heatmaps, export
- Client share links / embed
- MCP (stdio) over a read API key for agents
- MIT license

**Demo:** https://wispstat.heyeddi.com  
**Deploy:** see README (Cloudflare Deploy button or `npm run setup`)

Security reports: security@heyeddi.com (private) — see SECURITY.md.

## Optional Show HN blurb

**Show HN: Wispstat – cookie-free analytics on Cloudflare Workers (MIT)**

Self-hosted analytics for people who want pageviews and attribution without cookie banners. One Worker, D1 + KV, tiny tracker. Built by HeyEddi; dogfooded at wispstat.heyeddi.com.
