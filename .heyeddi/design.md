# Wispstat marketing — design

**Date:** 2026-11-03  
**Identity:** C — Beacon strip (locked; replaces Signal mist)

## Subject

Open-source, cookie-free analytics on Cloudflare. One honest amber beacon on a dark wall — then the manual. Not a surveillance dashboard, not mint fog SaaS.

## Tokens

| Token | Value |
|-------|--------|
| `--bg` | `#101010` |
| `--surface` | `#1a1a1a` |
| `--fg` | `#f2f0eb` |
| `--muted` | `#a8a49a` |
| `--accent` | `#2f6b4f` (dark green beacon) |
| `--accent-ink` | `#e8f2ec` |
| `--line` | `#2c2c2c` |
| Display | Newsreader |
| Body | DM Sans |
| Mono | IBM Plex Mono |

## Hard rejects

Mint Signal mist, soft green fog blobs, purple gradients, cream+terracotta, Inter-only kit, card-grid hero, glow-neon cyber.

## Signature

Full-bleed dark canvas; a single vertical dark-green beacon strip as the dominant first-viewport mark. Brand loudest; one headline; one lede; ≤2 CTAs. Density lives below the fold (install, OSS, docs).

## Routes

| Route | Job |
|-------|-----|
| `/` | Convince a builder: install path + MIT open source + open docs/app |
| `/docs` | Public operator docs (install → defaults → events → share → security) |
| Worker app | Product — out of scope for this sheet |

## Decision log

- 2026-11-03: User chose C Beacon strip; redesign marketing + add public docs; keep install + OSS explicit.
- 2026-11-04: Standardize `/docs` to same Beacon shell (surface panel, ul TOC, cache-bust CSS). Hard reject browser link purple + mint leftovers.
- 2026-11-04: Accent refined — amber/gold → dark green `#2f6b4f` (not mint Signal mist).
