# Contributing to HeyEddi Wispstat

**Date:** 2026-11-04

Thanks for helping. Keep changes small and testable.

## Before a PR

1. Open an issue for anything larger than a focused fix.
2. Use a feature branch — do not push straight to `main`.
3. Run locally:

```bash
npm ci
cd dashboard && npm ci && cd ..
cd tracker && npm ci && cd ..
cd mcp && npm ci && cd ..
npm run predeploy -- --skip-secrets
```

4. Prefer conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Security

Do **not** discuss exploits in public issues. Email [security@heyeddi.com](mailto:security@heyeddi.com) — see [`SECURITY.md`](SECURITY.md).

Never commit `.dev.vars`, API keys, or live `SETUP_TOKEN` values.

## Scope tips

- Tracker size and Free-tier cost matter — avoid heavy deps in `tracker/` and the Worker.
- Dashboard is Vue 3 static assets of the Worker; marketing is the separate Firebase site under `marketing/`.
