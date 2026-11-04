/**
 * POST /a — the caller's own same-day first touch. Read-only. No visitor hash in the body.
 */

import type { Env } from '../lib/types';
import { getConfig } from '../../wispstat.config';
import { isValidSiteId, getLocalDate, getPartitionSuffix } from '../lib/utils';
import { getSalt } from '../lib/salt';
import { computeVisitorHash, isBot } from '../lib/visitor';
import { withinLimits } from '../lib/ratelimit';
import { partitionTables } from '../lib/partitions';
import { corsHeaders, getSiteCached, rateLimited } from './index';

interface Touch {
  channel: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  ref_host: string | null;
  date: string | null;
}

const empty: Touch = {
  channel: null,
  source: null,
  medium: null,
  campaign: null,
  content: null,
  term: null,
  ref_host: null,
  date: null,
};

export async function handleAttribution(request: Request, env: Env): Promise<Response> {
  const config = getConfig(env);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return json({ error: { code: 'method_not_allowed', message: 'POST required' } }, 405, request);
  }

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > config.limits.beaconMaxBytes) {
    return json({ error: { code: 'payload_too_large', message: 'Payload exceeds limit' } }, 413, request);
  }

  let payload: { s?: string; p?: string };
  try {
    payload = await request.json() as { s?: string; p?: string };
  } catch {
    return json({ error: { code: 'invalid_json', message: 'Invalid JSON' } }, 400, request);
  }

  if (!payload.s || !isValidSiteId(payload.s)) {
    return json({ error: { code: 'invalid_site_id', message: 'Invalid site_id' } }, 400, request);
  }
  if (!payload.p || !payload.p.startsWith('/')) {
    return json({ error: { code: 'invalid_path', message: 'Path must start with /' } }, 400, request);
  }

  const site = await getSiteCached(env, payload.s);
  if (!site || site.ingest_paused) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  let originHost = '';
  try {
    originHost = new URL(origin).hostname.replace(/^www\./, '');
  } catch {
    originHost = '';
  }
  const domainList = JSON.parse(site.domains) as string[];
  if (!originHost || !domainList.some((domain) => originHost === domain || originHost === `www.${domain}`)) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (site.honor_dnt && (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1')) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const userAgent = request.headers.get('user-agent') || '';
  if (isBot(userAgent)) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  const ip = request.headers.get('cf-connecting-ip') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!withinLimits(site.site_id, ip, now, config.limits.rateLimit)) {
    return rateLimited(request);
  }

  const localDate = getLocalDate(now, site.tz);
  const salt = await getSalt(env, site.site_id, localDate);
  const vh = await computeVisitorHash(salt, site.site_id, ip, userAgent);
  const vhHex = Array.from(vh).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const { vis } = partitionTables(getPartitionSuffix(localDate));

  const table = await env.INGEST.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).bind(vis).first();
  if (!table) return json(empty, 200, request);

  const row = await env.INGEST.prepare(`
    SELECT channel, source, medium, campaign, content, term, ref_host
    FROM ${vis} WHERE sid = ? AND vh = x'${vhHex}'
  `).bind(site.sid).first<Omit<Touch, 'date'>>();

  if (!row) return json(empty, 200, request);

  return json({
    channel: row.channel,
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    content: row.content,
    term: row.term,
    ref_host: row.ref_host,
    date: localDate,
  }, 200, request);
}

function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'content-type': 'application/json' },
  });
}
