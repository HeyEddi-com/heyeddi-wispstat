# Learnings — heyeddi-wispstat

## 2026-11-03 — Pre-deploy ritual

**Context:** Production readiness beyond unit tests.

**Process:**
1. `npm run predeploy` before every deploy (typecheck, vitest, build, `check:secrets`, MCP syntax).
2. CI runs the same gate with `--skip-secrets`.
3. After deploy: `npm run smoke -- <url>`; deep path with `SMOKE_EMAIL` / `SMOKE_PASSWORD` / `WISPSTAT_API_KEY`; MCP with `npm run smoke:mcp`.

**Notes:** Live Cloudflare mutate stays operator-terminal (local-first). Agents may plan/typecheck/test/build and document; humans run `setup` / `deploy` / secret puts.

## 2026-11-03 — Marketing + app hosts (superseded)

**Context:** Tried CF subdomain zone for `wispstat.heyeddi.com` while apex stayed on GCP.

**Notes:** Free plan rejects subdomain zones (error 1116). Superseded by Firebase marketing + Worker app below.

## 2026-11-03 — Marketing Firebase, app Worker

**Context:** Keep apex DNS on GCP; avoid CF Free subdomain-zone limits.

**Process:**
1. Marketing: Firebase Hosting site `wispstat` → `wispstat.heyeddi.com` (`heyeddi-cli-infra/firebase-wispstat.tf` + `marketing/` deploy).
2. App / API / `ws.js`: Cloudflare Worker `https://heyeddi-wispstat.heyeddi.workers.dev`.
3. Set `enable_wispstat_cloudflare = false` (no Pages / CF zone).

**Notes:** See `docs/wispstat-domains.md`. Terraform apply + `npm run deploy` in `marketing/` are human (local-first).

## 2026-11-04 — Security contact via heyeddi.com catch-all

**Context:** OSS readiness needed a private vuln mailbox; heyeddi.com has catch-all mail.

**Process:**
1. Publish `SECURITY.md` with `security@heyeddi.com` (catch-all → maintainers).
2. Instruct reporters: private email only, redact secrets, throwaway repro, coordinated disclosure.
3. Include operator hardening checklist (SETUP_TOKEN, share links, no `.dev.vars` in git).
4. Point README / operator guide / marketing `/docs#security` at the same address + file.

## 2026-11-03 — Firebase Hosting ADC quota project (fixed in TF)

**Context:** `google_firebase_hosting_site` failed with 403: user ADC has no quota project → consumer `projects/32555940559` → `SERVICE_DISABLED`.

**Process (in `heyeddi-cli-infra`):** Do **not** require operators to run `gcloud auth application-default set-quota-project`.

1. `provider "google-beta" { alias = "firebase"; user_project_override = true; billing_project = "heyeddi-b7e3c" }`
2. Hosting resources use `provider = google-beta.firebase`
3. `google_project_service` enables `firebasehosting.googleapis.com` on `heyeddi-b7e3c`

**Notes:** Manual ADC quota set is optional fallback only; Terraform must succeed without it.
