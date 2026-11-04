# Wispstat operator guide

**Date:** 2026-11-03  
**Instance UI:** `/docs` on your Worker

Cookie-free analytics on your Cloudflare Worker. Pageviews and light auto-events are on by default; custom goals and client shares are opt-in.

## Add a site

1. Overview → **Add a site**.
2. Enter **one domain root** (`example.com` or `app.example.com`). That host and every subdomain under it may send beacons. Install only that site’s snippet on hosts you want measured.
3. Pick a timezone (day boundaries + visit explorer).
4. Paste the snippet from Settings (or the create response).

```html
<script defer src="https://YOUR_WORKER/ws.js" data-site="s_…"></script>
```

`data-site` is public; it is not a secret.

## Defaults the script logs

- **Pageviews** on load (unless `data-auto="false"`).
- **SPA navigations** when `data-spa="auto"` (default).
- **Outbound link clicks** → `outbound:<host>` (disable with `data-auto-events="false"`).
- **File downloads** (pdf, zip, office, …) → `file_download:<name>` (`data-file-types` to customize).
- **Form submits** → `form_submit` (path only — **never** field values).
- **Click heat** → `hm.<x>.<y>` on a 12×12 viewport grid (throttled; no raw coordinates). Disable with `data-heatmap="false"`.
- **Scroll depth** → `scroll.25` / `50` / `75` / `100`.

### Attribution (first touch, same local day)

On the first pageview of a load the tracker sends, when present:

- `utm_source` **or** `ref` **or** `via`
- `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- external `document.referrer` (host → channel)

Those fields become the visitor-day’s first-touch source. Later pageviews/events/goals that day inherit it. For your CRM: `wispstat('attribution')`.

Optional: `data-respect-dnt`, `data-exclude="/admin"`, `data-mask="/user/*"`, `data-hash-mode`.

## Custom events

```js
wispstat('pageview');
wispstat('event', 'signup');
wispstat('event', 'purchase', { value: 49.9 });
wispstat('event', 'signup', { props: { role: 'founder' } });
```

Names ≤64 chars, `[a-z0-9_:.-]`. Create a **Goal** for conversions. Props need Settings → Event properties.

## Visits (journeys)

Site → **Visits**. Same-day explorer over raw partitions (~3 days):

- Filter: min duration, has/missing `form_submit` / `outbound` / `file_download`, or a single visitor hash
- Open a visit → ordered timeline (pages + events). No replay.
- Typical paths for the filtered set

Sessions are approximate: same visitor hash, new session after 30 minutes idle, same local day. New sites enable session rollups by default.

## Heatmaps

Site → **Heatmaps**. Aggregate attention map for a day + path:

- 12×12 viewport-relative click intensity (not a pixel overlay of your CSS)
- Scroll-depth bars
- Raw day while partitions exist; after day-close, rolled-up `heat_daily` / `scroll_daily`

No session replay.

## Share with a client

Site → Settings → **Share with a client** → Create share link (shown once).

- Open URL, or
- iframe embed

Read-only. Revoke under API keys anytime.

## MCP (agents)

No Slack digest. Point Cursor (or any MCP client) at `mcp/src/index.js` with:

- `WISPSTAT_BASE_URL` — your Worker origin  
- `WISPSTAT_API_KEY` — a **read** key from Settings  

Tools: budget, summary, sources, live, visits, heatmap, visit timeline. Details in `mcp/README.md`.

Verify after deploy:

```bash
WISPSTAT_BASE_URL=https://YOUR_WORKER WISPSTAT_API_KEY=wsk_… npm run smoke:mcp
```

## Security

Visitors: no cookies by default; daily hashes; domain root + subdomains.  
You: strong owner password; keep SETUP_TOKEN private.  
Clients: share link sees that site’s summary only.  
Forms: submit events never include field values.

Report product vulnerabilities privately: [security@heyeddi.com](mailto:security@heyeddi.com) —
see [`SECURITY.md`](../SECURITY.md) for secure reporting steps and an operator checklist.

## Data budget

Overview estimates Cloudflare Free writes/requests vs ~100k/day caps from real traffic only.
