# Wispstat MCP

Thin stdio MCP for HeyEddi Wispstat. Agents query your Worker over the existing **read API key** — no Slack digest.

## Setup

1. In the dashboard: site → Settings → create a **read** API key (empty origins = any).
2. Install deps:

```bash
cd mcp && npm install
```

3. Cursor / MCP client config example:

```json
{
  "mcpServers": {
    "wispstat": {
      "command": "node",
      "args": ["/ABS/PATH/heyeddi-wispstat/mcp/src/index.js"],
      "env": {
        "WISPSTAT_BASE_URL": "https://heyeddi-wispstat.heyeddi.workers.dev",
        "WISPSTAT_API_KEY": "wsk_s_…_…"
      }
    }
  }
}
```

## Tools

| Tool | Purpose |
|------|---------|
| `wispstat_budget` | Today’s write/request budget estimate |
| `wispstat_summary` | Site KPIs for a range |
| `wispstat_sources` | Channels / sources |
| `wispstat_live` | Last ~30 minutes |
| `wispstat_visits` | Filtered same-day journeys |
| `wispstat_visit_timeline` | One visitor-hash timeline |
| `wispstat_heatmap` | Aggregate click grid + scroll depth |

`site_id` is optional when the key embeds it (`wsk_<siteId>_…`).
