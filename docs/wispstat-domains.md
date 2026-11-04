# Wispstat domains (HeyEddi public demo)

**Date:** 2026-11-03  
**Note:** Self-hosters use their own Worker URL. This file documents the **HeyEddi-operated** demo hosts.

| Host | Role |
|------|------|
| `https://wispstat.heyeddi.com` | Marketing (Firebase Hosting, site `wispstat`) |
| `https://heyeddi-wispstat.heyeddi.workers.dev` | App, API, `/ws.js` (Cloudflare Worker) |

Apex `heyeddi.com` DNS stays on **GCP Cloud DNS**.

## Terraform (`heyeddi-cli-infra`, workspace `default`)

`firebase-wispstat.tf` creates the Hosting site + custom domain + GCP `A`/`TXT` for `wispstat`.

```bash
cd heyeddi-cli-infra
terraform workspace select default
terraform plan -out=wispstat-firebase.tfplan
terraform apply "wispstat-firebase.tfplan"
```

Terraform uses `provider.google-beta.firebase` with `user_project_override` + `billing_project = heyeddi-b7e3c`, and enables `firebasehosting.googleapis.com` — no manual ADC quota-project step.

**Project vs site:** Do **not** create a new Firebase/GCP project. Reuse `heyeddi-b7e3c` (already Firebase; hosts default + staging/ci). TF creates an *additional* Hosting site id `wispstat` via `projects.sites.create` — no console create, no import — unless the site already exists (`409`), then:

```bash
firebase hosting:sites:list --project heyeddi-b7e3c
# if wispstat is listed:
terraform import 'google_firebase_hosting_site.wispstat' projects/heyeddi-b7e3c/sites/wispstat
```

Set `enable_wispstat_cloudflare = false` in `terraform.tfvars` (no CF Pages/zone).

If a prior apply created the `wispstat` A record and failed on the Hosting site, re-plan/apply — remaining adds are API (if needed), site, TXT, custom domain.

## Deploy marketing

Site `wispstat` is created by Terraform (`https://wispstat.web.app`). Deploy only uploads content:

```bash
cd heyeddi-wispstat/marketing
npm run deploy   # sets GOOGLE_CLOUD_QUOTA_PROJECT=heyeddi-b7e3c for ADC
```

If CLI says “Failed to get Firebase project” without that env: either use `npm run deploy`, or `firebase login`, or `gcloud auth application-default set-quota-project heyeddi-b7e3c`.

## Tracker

```html
<script defer src="https://heyeddi-wispstat.heyeddi.workers.dev/ws.js" data-site="s_…"></script>
```
