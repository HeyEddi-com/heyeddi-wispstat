# Privacy Policy

**Last updated:** {{date}}

This privacy policy describes how {{operator}} ("we", "us", "our") collects and processes data through our website analytics at {{site_domain}}, powered by self-hosted privacy-first analytics running on {{instance_origin}}.

## What We Collect

We collect minimal, anonymized analytics data to understand how our website is used:

- **URL path** (e.g., `/about`). Never the query string or hash fragment.
- **Referrer hostname** (e.g., `google.com`). Never the full URL with path/query.
- **UTM campaign parameters** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`)
- **Country** (derived from IP address, which is never stored)
- **Device type** (desktop, mobile, tablet)
- **Browser family** (Chrome, Firefox, Safari, etc.)
- **Operating system family** (Windows, macOS, Linux, iOS, Android)
- **Base language** (e.g., `en`, `es`, `pt`). Never the full language list or region.
- **Timestamps** (server time only)
- **Custom event names** (e.g., "signup"), with optional numeric values in aggregate
- **Aggregate click heat** (coarse viewport grid cell only, e.g. 12×12) and **scroll-depth milestones** (25/50/75/100%). No screenshots, no session replay, no raw click coordinates.
- **Automatic interaction events** such as outbound link hosts, file download names, and form submit (path only — never form field values)

## What We Do NOT Collect

We explicitly do NOT collect:

- ❌ **IP addresses** (processed in memory only, never stored)
- ❌ **User-Agent strings** (parsed to categories, raw string never stored)
- ❌ **Cookies, localStorage, sessionStorage, or IndexedDB** on your device (unless you enable an optional consented mode with your own banner)
- ❌ **Raw screen size, device pixel ratio, or exact click coordinates** (heat uses an ephemeral viewport grid index only)
- ❌ **Full language lists, installed fonts, or plugins**
- ❌ **Canvas, WebGL, or audio fingerprints**
- ❌ **Client-side identifiers or cross-site/cross-device tracking** (default mode)
- ❌ **Personal information** (emails, names, phone numbers, user IDs)
- ❌ **Query strings** (which may contain sensitive parameters)
- ❌ **Form field values**

## How We Identify "Visitors"

We use a **daily visitor hash** to count unique visitors per day:

1. A random **salt** is generated for each site for each local calendar day
2. We combine: `salt + site_id + truncated_IP + User-Agent_category`
3. We hash this combination with SHA-256 and keep the first 16 bytes
4. The salt **expires ~6 hours after the local day ends** and is permanently deleted

This means:
- We cannot reconstruct your IP or User-Agent from the hash
- We cannot link you across days (the hash changes daily)
- We cannot link you across sites (each site has a separate salt)
- If you change networks or devices, you appear as a different visitor

## Data Retention

- **Raw visitor data**: Kept for ~{{raw_retention_days}} days, then permanently deleted
- **Aggregated statistics**: Kept indefinitely (counts only, no individual visitor data)
- **Database backups**: Raw data is backed up for up to {{time_travel_days}} days via Cloudflare D1 Time Travel

## Legal Basis & Your Rights

{{operator}} is the data controller. We process analytics data based on our legitimate interest in understanding website usage.

You have the right to:
- Request information about what data we hold (answer: we hold no identifiable data about individual visitors)
- Request deletion (answer: visitor hashes are already deleted after {{raw_retention_days}} days; aggregates cannot be "de-aggregated")

Because we store no persistent identifiers, we cannot action access or deletion requests against a specific visitor.

## Third-Party Data Processors

We use **Cloudflare** to host our analytics infrastructure. Cloudflare processes IP addresses as our network provider but does not store them in our analytics database. See [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).

We do **not** share data with any other third parties. We do **not** sell, rent, or trade any data.

## Do Not Track (DNT) / Global Privacy Control (GPC)

{{#if honor_dnt}}
This site respects Do Not Track (DNT) and Global Privacy Control (GPC) signals. If your browser sends `DNT: 1` or `Sec-GPC: 1`, we will not track you.
{{else}}
This site does not currently respond to Do Not Track (DNT) or Global Privacy Control (GPC) signals, but we collect no cookies or persistent identifiers regardless.
{{/if}}

## Cookies

**We do not use cookies for analytics tracking.** The only cookie on this site (if any) is for our own authenticated admin dashboard and is not set on tracked sites.

## Changes to This Policy

We may update this policy from time to time. The "Last updated" date at the top reflects the most recent revision.

## Contact

If you have questions about this privacy policy or our data practices, contact us at {{contact}}.

---

**Note:** This is a template privacy policy provided by the open-source analytics software we use. It is not legal advice. {{operator}} is responsible for ensuring compliance with applicable laws in their jurisdiction.
