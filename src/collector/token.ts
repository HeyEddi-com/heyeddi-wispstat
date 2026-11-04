/**
 * POST /t — mint a short-lived visit token for S2S attribution (v1.2).
 */

import type { Env } from '../lib/types';
import { getConfig } from '../../wispstat.config';
import { isValidSiteId, getLocalDate } from '../lib/utils';
import { getSalt } from '../lib/salt';
import { computeVisitorHash, isBot } from '../lib/visitor';
import { withinLimits } from '../lib/ratelimit';
import { mintVisitToken, visitTokenExpiry } from '../lib/visit-token';
import { corsHeaders, getSiteCached, rateLimited } from './index';
import { hostMatchesAnyDomain } from '../lib/domains';

function localDayEndSec(day: string, tz: string): number {
  // Approximate: noon UTC on day+1 adjusted via locale format — use epoch of next local midnight
  const [ys, ms, ds] = day.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return Math.floor(Date.now() / 1000) + 86400;
  }
  // Iterate hours to find first UTC instant whose local date is day+1
  const start = Date.UTC(y, m - 1, d, 0, 0, 0) / 1000;
  for (let t = start; t < start + 48 * 3600; t += 3600) {
    const local = getLocalDate(t, tz);
    if (local > day) return t;
  }
  return start + 24 * 3600;
}

export async function handleVisitToken(request: Request, env: Env): Promise<Response> {
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
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    originHost = '';
  }
  const domains = JSON.parse(site.domains) as string[];
  if (!originHost || !hostMatchesAnyDomain(originHost, domains)) {
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

  const day = getLocalDate(now, site.tz);
  const salt = await getSalt(env, site.site_id, day);
  const vh = await computeVisitorHash(salt, site.site_id, ip, userAgent);
  const vhHex = Array.from(vh).map((b) => b.toString(16).padStart(2, '0')).join('');
  const exp = visitTokenExpiry(now, localDayEndSec(day, site.tz));
  const token = await mintVisitToken(env, { sid: site.sid, day, vh: vhHex, exp });
  if (!token) {
    return json({ error: { code: 'token_unavailable', message: 'TOKEN_KEY not configured' } }, 503, request);
  }

  return json({ visit_token: token, exp }, 200, request);
}

function json(body: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'content-type': 'application/json' },
  });
}
