#!/usr/bin/env node
/**
 * Thin Wispstat MCP — wraps the Worker read API. No Slack digest.
 *
 * Env:
 *   WISPSTAT_BASE_URL  e.g. https://heyeddi-wispstat.heyeddi.workers.dev
 *   WISPSTAT_API_KEY   read key wsk_<siteId>_<secret>
 *   WISPSTAT_SITE_ID   optional default site_id (else parsed from key)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const baseUrl = (process.env.WISPSTAT_BASE_URL || '').replace(/\/$/, '');
const apiKey = process.env.WISPSTAT_API_KEY || '';
const defaultSite =
  process.env.WISPSTAT_SITE_ID ||
  (apiKey.match(/^wsk_(s_[0-9a-hjkmnp-z]{16})_/) || [])[1] ||
  '';

if (!baseUrl || !apiKey) {
  console.error('Set WISPSTAT_BASE_URL and WISPSTAT_API_KEY (read key from site Settings).');
  process.exit(1);
}

async function api(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: 'application/json',
      'x-ws-key': apiKey,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body?.error?.message || body?.raw || response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }
  return body;
}

function siteOrDefault(siteId) {
  const id = siteId || defaultSite;
  if (!id) throw new Error('Pass site_id or set WISPSTAT_SITE_ID / use a wsk_s_… key');
  return id;
}

function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

function textResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

const server = new McpServer({
  name: 'wispstat',
  version: '0.1.0',
});

server.tool(
  'wispstat_budget',
  'Cloudflare Free-style write/request budget estimates for this instance today.',
  {},
  async () => textResult(await api('/api/v1/budget'))
);

server.tool(
  'wispstat_summary',
  'Site KPIs (visitors, pageviews, events, conversions, revenue) for a date range.',
  {
    site_id: z.string().optional().describe('Public site_id; defaults from env/key'),
    from: z.string().optional().describe('YYYY-MM-DD'),
    to: z.string().optional().describe('YYYY-MM-DD'),
  },
  async ({ site_id, from, to }) => {
    const site = siteOrDefault(site_id);
    return textResult(await api(`/api/v1/sites/${site}/summary${qs({ from, to })}`));
  }
);

server.tool(
  'wispstat_sources',
  'Traffic sources / channels for a site (optional by=channel|source|campaign).',
  {
    site_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    by: z.enum(['channel', 'source', 'campaign']).optional(),
  },
  async ({ site_id, from, to, by }) => {
    const site = siteOrDefault(site_id);
    return textResult(await api(`/api/v1/sites/${site}/sources${qs({ from, to, by })}`));
  }
);

server.tool(
  'wispstat_live',
  'Live window (~last 30 minutes): pageviews, events, top paths.',
  {
    site_id: z.string().optional(),
  },
  async ({ site_id }) => {
    const site = siteOrDefault(site_id);
    return textResult(await api(`/api/v1/sites/${site}/live`));
  }
);

server.tool(
  'wispstat_visits',
  'Same-day visit list with filters (duration, form_submit, visitor hash). Replaces Slack digest for “what happened”.',
  {
    site_id: z.string().optional(),
    day: z.string().optional().describe('YYYY-MM-DD (site local)'),
    vh: z.string().optional().describe('Visitor hash hex'),
    min_duration: z.number().optional().describe('Seconds'),
    has_event: z.string().optional().describe('e.g. form_submit, outbound, file_download'),
    missing_event: z.string().optional(),
    limit: z.number().optional(),
  },
  async (args) => {
    const site = siteOrDefault(args.site_id);
    const { site_id: _s, ...filters } = args;
    return textResult(await api(`/api/v1/sites/${site}/visits${qs(filters)}`));
  }
);

server.tool(
  'wispstat_visit_timeline',
  'Ordered page/event timeline for one visitor hash session (no replay).',
  {
    site_id: z.string().optional(),
    vh: z.string().describe('Visitor hash hex'),
    day: z.string().describe('YYYY-MM-DD'),
    session: z.number().optional().describe('Session index within the day (default 0)'),
  },
  async ({ site_id, vh, day, session }) => {
    const site = siteOrDefault(site_id);
    return textResult(
      await api(`/api/v1/sites/${site}/visits/${encodeURIComponent(vh)}${qs({ day, session })}`)
    );
  }
);

server.tool(
  'wispstat_heatmap',
  'Aggregate viewport-grid click heat + scroll depth for a day/path (no replay).',
  {
    site_id: z.string().optional(),
    day: z.string().optional().describe('YYYY-MM-DD'),
    path: z.string().optional().describe('Path filter, e.g. /pricing'),
  },
  async ({ site_id, day, path }) => {
    const site = siteOrDefault(site_id);
    return textResult(await api(`/api/v1/sites/${site}/heatmap${qs({ day, path })}`));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
