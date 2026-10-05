/**
 * Collector endpoint (POST /e)
 * Ingests pageviews and custom events
 */

import type { Env, BeaconPayload, Site, Goal } from '../lib/types';
import { getConfig } from '../../edgemetry.config';
import {
  isValidSiteId,
  normalizePath,
  normalizeUtm,
  normalizeEventName,
  normalizeLanguage,
  normalizeValue,
  coarseIpHash,
  errorResponse,
  getLocalDate,
  getPartitionSuffix,
  parseJsonSafe,
} from '../lib/utils';
import { getSalt } from '../lib/salt';
import { computeVisitorHash, parseUserAgent, isBot } from '../lib/visitor';
import { computeChannel } from '../lib/channels';

// Isolate caches
const siteCache = new Map<string, { site: Site; expires: number }>();
const goalCache = new Map<number, { goals: Goal[]; expires: number }>();

export async function handleCollector(request: Request, env: Env): Promise<Response> {
  const config = getConfig(env);
  
  // CORS preflight
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
    return errorResponse('method_not_allowed', 'POST required', 405);
  }
  
  // 1. Size check
  const contentLength = parseInt(request.headers.get('content-length') || '0');
  if (contentLength > config.limits.beaconMaxBytes) {
    return errorResponse('payload_too_large', 'Payload exceeds limit', 413);
  }
  
  // 2. Parse and validate payload
  let payload: BeaconPayload;
  try {
    payload = await request.json() as BeaconPayload;
  } catch {
    return errorResponse('invalid_json', 'Invalid JSON', 400);
  }
  
  if (!payload.s || !isValidSiteId(payload.s)) {
    return errorResponse('invalid_site_id', 'Invalid site_id', 400);
  }
  
  if (!payload.p || !payload.p.startsWith('/')) {
    return errorResponse('invalid_path', 'Path must start with /', 400);
  }
  
  if (payload.k !== 'pv' && payload.k !== 'ev') {
    return errorResponse('invalid_kind', 'Kind must be pv or ev', 400);
  }
  
  // 3. Site lookup (cached)
  const site = await getSiteCached(env, payload.s);
  if (!site || site.ingest_paused) {
    // Unknown or paused: drop silently
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  
  // 4. Origin check
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  const originHost = extractHost(origin);
  const domains = parseJsonSafe<string[]>(site.domains, []);
  
  if (!originHost || !domains.some(d => originHost === d || originHost === `www.${d}`)) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  
  // 5. DNT/GPC check
  if (site.honor_dnt) {
    if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
  }
  
  // 6. Bot filter
  const userAgent = request.headers.get('user-agent') || '';
  if (isBot(userAgent)) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  
  // 7. Rate limit (placeholder - actual Rate Limiting binding would go here)
  // For now, we'll skip this and add it when the binding is configured
  
  // 8. Compute visitor attributes
  const ip = request.headers.get('cf-connecting-ip') || '';
  const country = (request.cf?.country as string | undefined) || '';
  
  const now = Math.floor(Date.now() / 1000);
  const localDate = getLocalDate(now, site.tz);
  const partitionSuffix = getPartitionSuffix(localDate);
  
  const salt = await getSalt(env, site.site_id, localDate);
  const vh = await computeVisitorHash(salt, site.site_id, ip, userAgent);
  
  const uaInfo = parseUserAgent(userAgent);
  
  // Get all sites for channel computation (own sites detection)
  const allSites = await getAllSites(env);
  
  const referrer = payload.r || null;
  const attribution = computeChannel(payload, referrer, domains, allSites);
  
  // Language
  const clientLang = payload.l;
  const serverLang = request.headers.get('accept-language')?.split(',')[0]?.trim();
  const lang = normalizeLanguage(clientLang || serverLang);
  
  // Normalize fields
  const path = normalizePath(payload.p, config.limits.pathMaxLength);
  const eventName = payload.k === 'ev' ? normalizeEventName(payload.n, config.limits.eventNameMaxLength) : null;
  const valueX100 = payload.k === 'ev' ? normalizeValue(payload.v) : null;
  
  const utm_source = normalizeUtm(payload.us || payload.rf, config.limits.utmMaxLength);
  const utm_medium = normalizeUtm(payload.um, config.limits.utmMaxLength);
  const utm_campaign = normalizeUtm(payload.uc, config.limits.utmMaxLength);
  const utm_content = normalizeUtm(payload.ux, config.limits.utmMaxLength);
  const utm_term = normalizeUtm(payload.ut, config.limits.utmMaxLength);
  
  // 9. Goal matching
  const goals = await getGoalsCached(env, site.sid);
  let goalId: number | null = null;
  
  if (payload.k === 'pv') {
    const pathGoal = goals.find(g => g.kind === 'path' && g.active && matchesGoal(path, g));
    goalId = pathGoal?.goal_id || null;
  } else if (payload.k === 'ev' && eventName) {
    const eventGoal = goals.find(g => g.kind === 'event' && g.active && matchesGoal(eventName, g));
    goalId = eventGoal?.goal_id || null;
  }
  
  // 10. Respond immediately, write in waitUntil
  const response = new Response(null, { status: 204, headers: corsHeaders(request) });
  
  // 11. Write to D1 in background
  const writePromise = (async () => {
    try {
      const evTable = `ev_${partitionSuffix}`;
      const visTable = `vis_${partitionSuffix}`;
      
      // Ensure partition exists
      await ensurePartition(env.INGEST, partitionSuffix);
      
      // Batch write
      const vhHex = Array.from(vh).map(b => b.toString(16).padStart(2, '0')).join('');
      
      await env.INGEST.batch([
        // Event row
        env.INGEST.prepare(`
          INSERT INTO ${evTable} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src)
          VALUES (?, ?, ?, ?, ?, x'${vhHex}', 
            (SELECT NOT EXISTS (SELECT 1 FROM ${visTable} WHERE sid = ? AND vh = x'${vhHex}')),
            ?, ?, 0)
        `).bind(
          site.sid, now,
          payload.k === 'pv' ? 0 : 1,
          eventName, path,
          site.sid,
          goalId, valueX100
        ),
        
        // Visitor row (only if not exists)
        env.INGEST.prepare(`
          INSERT INTO ${visTable} (sid, vh, first_ts, channel, source, medium, campaign, content, term, ref_host, entry_path, country, lang, device, browser, os)
          SELECT ?, x'${vhHex}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM ${visTable} WHERE sid = ? AND vh = x'${vhHex}')
        `).bind(
          site.sid, now,
          attribution.channel, attribution.source, attribution.medium,
          attribution.campaign, attribution.content, attribution.term,
          attribution.ref_host, path, country, lang,
          uaInfo.device, uaInfo.browser, uaInfo.os,
          site.sid
        ),
      ]);
      
    } catch (error) {
      // Log error but don't fail the response
      console.error('D1 write error:', error);
    }
  })();
  
  // @ts-expect-error - waitUntil exists in Workers context
  if (typeof waitUntil === 'function') {
    // @ts-expect-error
    waitUntil(writePromise);
  } else {
    // In tests, await it
    await writePromise;
  }
  
  return response;
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function getSiteCached(env: Env, siteId: string): Promise<Site | null> {
  const cached = siteCache.get(siteId);
  if (cached && cached.expires > Date.now()) {
    return cached.site;
  }
  
  const result = await env.CORE.prepare(
    'SELECT * FROM sites WHERE site_id = ?'
  ).bind(siteId).first<{
    sid: number;
    site_id: string;
    slug: string | null;
    name: string;
    domains: string;
    tz: string;
    currency: string;
    honor_dnt: number;
    ingest_paused: number;
    digest_enabled: number;
    sessions_enabled: number;
    consent_mode: number;
    created_at: number;
  }>();
  
  if (!result) return null;
  
  const site: Site = {
    ...result,
    honor_dnt: Boolean(result.honor_dnt),
    ingest_paused: Boolean(result.ingest_paused),
    digest_enabled: Boolean(result.digest_enabled),
    sessions_enabled: Boolean(result.sessions_enabled),
    consent_mode: Boolean(result.consent_mode),
    domains: parseJsonSafe<string[]>(result.domains, []),
  };
  
  siteCache.set(siteId, { site, expires: Date.now() + 60_000 });
  return site;
}

async function getAllSites(env: Env): Promise<Site[]> {
  const results = await env.CORE.prepare('SELECT * FROM sites').all();
  
  return results.results.map((r: any) => ({
    ...r,
    honor_dnt: Boolean(r.honor_dnt),
    ingest_paused: Boolean(r.ingest_paused),
    digest_enabled: Boolean(r.digest_enabled),
    sessions_enabled: Boolean(r.sessions_enabled),
    consent_mode: Boolean(r.consent_mode),
    domains: parseJsonSafe<string[]>(r.domains, []),
  }));
}

async function getGoalsCached(env: Env, sid: number): Promise<Goal[]> {
  const cached = goalCache.get(sid);
  if (cached && cached.expires > Date.now()) {
    return cached.goals;
  }
  
  const results = await env.CORE.prepare(
    'SELECT * FROM goals WHERE sid = ? AND active = 1'
  ).bind(sid).all();
  
  const goals = results.results.map((r: any) => ({
    ...r,
    active: Boolean(r.active),
  })) as Goal[];
  
  goalCache.set(sid, { goals, expires: Date.now() + 60_000 });
  return goals;
}

function matchesGoal(value: string, goal: Goal): boolean {
  if (goal.match_type === 'exact') {
    return value === goal.pattern;
  } else {
    return value.startsWith(goal.pattern);
  }
}

async function ensurePartition(db: D1Database, suffix: string): Promise<void> {
  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ev_${suffix} (
          id INTEGER PRIMARY KEY,
          sid INTEGER NOT NULL,
          ts INTEGER NOT NULL,
          k INTEGER NOT NULL,
          name TEXT,
          path TEXT NOT NULL,
          vh BLOB NOT NULL,
          nv INTEGER NOT NULL DEFAULT 0,
          goal_id INTEGER,
          value_x100 INTEGER,
          src INTEGER NOT NULL DEFAULT 0
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS vis_${suffix} (
          sid INTEGER NOT NULL,
          vh BLOB NOT NULL,
          first_ts INTEGER NOT NULL,
          channel TEXT NOT NULL,
          source TEXT,
          medium TEXT,
          campaign TEXT,
          content TEXT,
          term TEXT,
          ref_host TEXT,
          entry_path TEXT,
          country TEXT,
          lang TEXT,
          device TEXT,
          browser TEXT,
          os TEXT,
          PRIMARY KEY (sid, vh)
        ) WITHOUT ROWID
      `),
    ]);
  } catch (error) {
    // Table might already exist, ignore
  }
}
