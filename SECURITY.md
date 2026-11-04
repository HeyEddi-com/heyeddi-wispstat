# Security policy — HeyEddi Wispstat

**Date:** 2026-11-04

We welcome private reports of security issues in this repository and in the
public HeyEddi demo instance.

## Report a vulnerability (privately)

**Email:** [security@heyeddi.com](mailto:security@heyeddi.com)

`heyeddi.com` uses a catch-all mailbox; that address reaches the maintainers.
Prefer email over public GitHub issues, Discussions, or Discord for anything
that could help an attacker.

### How to report securely

1. **Do not** open a public issue or PR that includes exploit details, secrets,
   or live instance URLs with tokens.
2. **Email** `security@heyeddi.com` from an account you can check for replies.
3. **Subject** something like `Wispstat security: <short title>`.
4. **Include** (as much as you can without widening exposure):
   - Affected component (Worker routes, tracker `ws.js`, dashboard, MCP, docs)
   - Version / commit / deploy date if known
   - Impact (who can do what: unauthenticated RCE, auth bypass, data leak, …)
   - Steps to reproduce on a **throwaway** Worker or local `wrangler dev`
   - Whether you already tested against `*.workers.dev` demo or only locally
5. **Redact** live `SETUP_TOKEN`, session cookies, API keys (`wsk_…`), and
   customer data. Use placeholders.
6. **Wait for acknowledgment** before any public disclosure. We aim to reply
   within a few business days. Coordinated disclosure after a fix is preferred.

We do not run a paid bug bounty today. Good-faith research that follows this
policy is appreciated; do not DoS Cloudflare Free quotas or other tenants.

## Scope

**In scope**

- This codebase (`heyeddi-wispstat`) as deployed by self-hosters
- Auth / claim (`SETUP_TOKEN`), session cookies, API keys, share links
- Collector / tracker privacy assumptions (e.g. form field leakage)
- The HeyEddi-operated demo Worker, if clearly labeled in the report

**Out of scope**

- Issues only in third-party services (Cloudflare, Firebase Hosting) with no
  Wispstat-specific bug
- Social engineering of individual self-hosters’ email accounts
- Reports that require a leaked operator secret the researcher obtained
  elsewhere (still tell us if you found one exposed in our repo or docs)

## Secure self-hosting (operators)

If you run your own Worker, treat it like production infrastructure:

| Practice | Why |
|----------|-----|
| Generate a long random `SETUP_TOKEN` (≥32 chars); store only as a Wrangler secret | Claim endpoint is the first-run crown jewel |
| After claim, keep owner password strong; do not reuse passwords | Local email/password is the admin boundary |
| Never commit `.dev.vars` or paste secrets into issues/chat | Tokens in git history are forever |
| Prefer your own `*.workers.dev` or custom host; rotate secrets if leaked | Demo URLs are not your production |
| Treat client **share links** like passwords; revoke when done | Read-only but site-wide summaries |
| MCP / API keys: use **read** keys for agents; don’t put write keys in IDE configs checked into git | Agents copy env into many places |
| `data-site` in HTML is public by design — not a secret | Restrict by domain root in the product, not by hiding the id |

Quick checks:

```bash
npm run check:secrets          # required secrets present on the Worker
npm run smoke -- https://YOUR_WORKER
```

More operator detail: [`docs/operator-guide.md`](docs/operator-guide.md) and
[`docs/production-deploy.md`](docs/production-deploy.md).

## Preferred languages

English or Spanish.
