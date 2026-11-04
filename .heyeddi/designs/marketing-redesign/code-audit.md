# Code audit — Wispstat marketing redesign

**Date:** 2026-11-03  
**Scope:** Firebase marketing site (`marketing/public/`) + public docs (today only inside Worker dashboard `Docs.vue`)

## Structure

| Surface | File | Notes |
|---------|------|--------|
| `/` marketing | `marketing/public/index.html` + `styles.css` | Static. Hero + Why + Deploy. Large empty vertical field; docs absent. |
| Docs (product) | `dashboard/src/views/Docs.vue` | Real public docs copy (install, defaults, goals, share, privacy). Lives behind Worker app — not on marketing host. |

## CSS

- Tokens exist (`--bg`, `--accent`, Fraunces / Source Sans 3 / IBM Plex Mono) — Identity A Signal mist.
- Fixed mist layers + sparse sections → first viewport reads as logo island on void (user: “too empty”).
- No docs layout, TOC, or multi-page IA on marketing.

## Fixes proposed (implement after identity lock)

1. Replace visual system for marketing (redesign gate) — current Signal mist tokens become hard reject for scoped pages unless user re-picks a mist-like option.
2. Add marketing `/docs` (static HTML or multi-page) seeded from `Docs.vue` public content — no fake claims.
3. Fill scroll with real sections (how it works, privacy, install, docs entry) without packing first viewport with stats strips.
4. Keep Worker app URL + tracker snippet as live facts.
