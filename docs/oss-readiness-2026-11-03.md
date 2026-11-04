# Open-source readiness — Wispstat

**Date:** 2026-11-03

## Verdict

**Aim: public repo + announce.** Code/security posture is fine for that; the real gate is **shipping `feat/wispstat-mvp` → `main`**, then flip visibility.

GitHub `HeyEddi-com/heyeddi-wispstat` is currently **private**. License is **MIT**. No committed live secrets found in a quick scan (`.dev.vars` is example-only; secrets go via `wrangler secret put`).

Launch runbook: [`public-launch-checklist.md`](public-launch-checklist.md) · announce copy: [`announce-draft-2026-11-04.md`](announce-draft-2026-11-04.md).

## Safe for public code

| Area | Status |
|------|--------|
| License | MIT present |
| Secrets in git | No live `SETUP_TOKEN` / session keys found; setup prints tokens to the operator terminal |
| `check:secrets` | Exists for predeploy |
| Tracker model | `data-site` is intentionally public; forms never send field values |
| Self-host story | README + setup path documented |

## Before you flip to public

1. **SECURITY.md / contact** — Done (`security@heyeddi.com` via heyeddi.com catch-all). See root `SECURITY.md`.
2. **Demo vs self-host** — Marketing may mention HeyEddi’s `*.workers.dev` as a demo; keep `YOUR_WORKER` in install docs for forks.
3. **Branch hygiene** — Prefer releasing from a clean `main` (or a tagged release); avoid publishing WIP branches with internal notes only.
4. **Ops docs** — `docs/wispstat-domains.md` and Firebase project IDs are HeyEddi-ops specific; fine in-repo if labeled as the public demo host, or move under an `ops/` note.
5. **Confirm claim flow** — Unclaimed Worker with a leaked `SETUP_TOKEN` is the real risk; rotate token if it ever hit chat/logs, and never commit `.dev.vars`.

## Product safety (visitor privacy)

Default mode is cookie-free with daily hashed IDs; form submits omit values. That is the intended OSS privacy story — still not legal advice for every jurisdiction.
