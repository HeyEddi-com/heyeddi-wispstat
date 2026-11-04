/**
 * Collector endpoint (POST /e)
 * Ingests pageviews and custom events
 */

import type { Env, BeaconPayload, Site, Goal } from '../lib/types';
import { CONSTANTS, getConfig } from '../../wispstat.config';
import {
  isValidSiteId,
  normalizePath,
  normalizeEventName,
  normalizeLanguage,
  normalizeValue,
  errorResponse,
  getLocalDate,
  getPartitionSuffix,
  parseJsonSafe,
} from '../lib/utils';
import { getSalt } from '../lib/salt';
import { computeVisitorHash, parseUserAgent, isBot } from '../lib/visitor';
import { computeChannel } from '../lib/channels';
import { hostMatchesAnyDomain } from '../lib/domains';
import { ensurePartition } from '../lib/partitions';
import { withinLimits } from '../lib/ratelimit';
import { loadPropDefs, mapProps } from '../lib/props';
import { hashCid, isValidCid } from '../lib/consent';

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
  
  // 4. Origin check — measurement root + subdomains
  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  const originHost = extractHost(origin);
  const domainList = JSON.parse(site.domains) as string[];

  if (!originHost || !hostMatchesAnyDomain(originHost, domainList)) {
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
  
  const ip = request.headers.get('cf-connecting-ip') || '';
  const now = Math.floor(Date.now() / 1000);
  if (!withinLimits(site.site_id, ip, now, config.limits.rateLimit)) {
    return rateLimited(request);
  }

  // 8. Compute visitor attributes
  const country = (request.cf?.country as string | undefined) || '';
  
  const localDate = getLocalDate(now, site.tz);
  const partitionSuffix = getPartitionSuffix(localDate);
  
  const salt = await getSalt(env, site.site_id, localDate);
  const vh = await computeVisitorHash(salt, site.site_id, ip, userAgent);
  
  const uaInfo = parseUserAgent(userAgent);
  
  // Get all sites for channel computation (own sites detection)
  const allSites = await getAllSites(env);
  
  const referrer = payload.r || null;
  const attribution = computeChannel(payload, referrer, domainList, allSites);
  
  // Language
  const clientLang = payload.l;
  const serverLang = request.headers.get('accept-language')?.split(',')[0]?.trim();
  const lang = normalizeLanguage(clientLang || serverLang);
  
  // Normalize fields
  const path = normalizePath(payload.p, config.limits.pathMaxLength);
  const eventName = payload.k === 'ev' ? normalizeEventName(payload.n, config.limits.eventNameMaxLength) : null;
  const valueX100 = payload.k === 'ev' ? normalizeValue(payload.v) : null;
  
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
      const upgrade = site.upgrade_direct
        && attribution.channel !== CONSTANTS.CHANNEL_DIRECT
        && attribution.channel !== CONSTANTS.CHANNEL_OWN_SITES;

      const defs = payload.k === 'ev' ? await loadPropDefs(env.CORE, site.sid) : [];
      const mapped = mapProps(defs, payload.props);

      const writes = [
        // Event row
        env.INGEST.prepare(`
          INSERT INTO ${evTable} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src, p1, p2, p3)
          VALUES (?, ?, ?, ?, ?, x'${vhHex}', 
            (SELECT NOT EXISTS (SELECT 1 FROM ${visTable} WHERE sid = ? AND vh = x'${vhHex}')),
            ?, ?, 0, ?, ?, ?)
        `).bind(
          site.sid, now,
          payload.k === 'pv' ? 0 : 1,
          eventName, path,
          site.sid,
          goalId, valueX100,
          mapped.p1, mapped.p2, mapped.p3
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
      ];

      if (upgrade) {
        writes.push(env.INGEST.prepare(`
          UPDATE ${visTable}
          SET channel = ?, source = ?, medium = ?, campaign = ?, content = ?, term = ?, ref_host = ?
          WHERE sid = ? AND vh = x'${vhHex}' AND channel = ?
        `).bind(
          attribution.channel, attribution.source, attribution.medium,
          attribution.campaign, attribution.content, attribution.term,
          attribution.ref_host,
          site.sid, CONSTANTS.CHANNEL_DIRECT
        ));
      }

      await env.INGEST.batch(writes);

      if (site.consent_mode && isValidCid(payload.cid)) {
        const pepper = config.sessionSecret || config.setupToken;
        const cidHash = await hashCid(pepper, site.sid, payload.cid);
        const cidHex = Array.from(cidHash).map((b) => b.toString(16).padStart(2, '0')).join('');
        await env.CORE.prepare(`
          INSERT INTO consented_visitors (
            sid, cid_hash, first_day, first_channel, first_source, first_medium, first_campaign, last_day, active_days
          ) VALUES (?, x'${cidHex}', ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(sid, cid_hash) DO UPDATE SET
            last_day = excluded.last_day,
            active_days = consented_visitors.active_days +
              CASE WHEN consented_visitors.last_day = excluded.last_day THEN 0 ELSE 1 END
        `).bind(
          site.sid,
          localDate,
          attribution.channel,
          attribution.source,
          attribution.medium,
          attribution.campaign,
          localDate,
        ).run();
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('D1 write error:', message);
      if (/quota|limit exceeded|too many/i.test(message)) {
        const until = String(Math.floor(Date.now() / 1000) + 60);
        await env.CORE.prepare(
          `INSERT INTO rollup_state (job, scope, value) VALUES ('shed', 'collector', ?)
           ON CONFLICT(job, scope) DO UPDATE SET value = excluded.value`
        ).bind(until).run();
      }
    }
  })();
  
  // @ts-expect-error - waitUntil exists in Workers context
  if (typeof waitUntil === 'function') {
    // @ts-expect-error waitUntil is a Workers global, not in the DOM lib
    waitUntil(writePromise);
  } else {
    // In tests, await it
    await writePromise;
  }
  
  return response;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function rateLimited(request: Request): Response {
  return new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Slow down' } }), {
    status: 429,
    headers: {
      ...corsHeaders(request),
      'content-type': 'application/json',
      'retry-after': '60',
    },
  });
}

export async function getSiteCached(env: Env, siteId: string): Promise<Site | null> {
  const cached = siteCache.get(siteId);
  if (cached && cached.expires > Date.now()) {
    return cached.site;
  }
  
  const result = await env.CORE.prepare(
    'SELECT * FROM sites WHERE site_id = ?'
  ).bind(siteId).first<Site>();
  
  if (!result) return null;
  
  const site: Site = {
    ...result,
    honor_dnt: Boolean(result.honor_dnt),
    ingest_paused: Boolean(result.ingest_paused),
    digest_enabled: Boolean(result.digest_enabled),
    sessions_enabled: Boolean(result.sessions_enabled),
    upgrade_direct: Boolean(result.upgrade_direct),
    consent_mode: Boolean(result.consent_mode),
  };
  
  siteCache.set(siteId, { site, expires: Date.now() + 60_000 });
  return site;
}

interface ParsedSite {
  sid: number;
  site_id: string;
  slug: string | null;
  name: string;
  domains: string[];
  tz: string;
  currency: string;
  honor_dnt: boolean;
  ingest_paused: boolean;
  digest_enabled: boolean;
  sessions_enabled: boolean;
  consent_mode: boolean;
  created_at: number;
}

async function getAllSites(env: Env): Promise<ParsedSite[]> {
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
  }
  return value.startsWith(goal.pattern);
}
