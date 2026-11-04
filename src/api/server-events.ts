/**
 * v1.2 POST /api/v1/server/events — S2S events with optional visit token.
 */

import type { Env, Site } from '../lib/types';
import { CONSTANTS } from '../../wispstat.config';
import { getConfig } from '../../wispstat.config';
import {
  errorResponse,
  normalizeEventName,
  normalizeValue,
  sha256,
  getLocalDate,
  getPartitionSuffix,
} from '../lib/utils';
import { openVisitToken } from '../lib/visit-token';
import { ensurePartition, partitionTables } from '../lib/partitions';
import { BRANDING } from '../../branding.config';

const IDEM_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

function hexLit(hex: string): string {
  return `x'${hex.toLowerCase()}'`;
}

export async function handleServerEvent(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST required', 405);
  }

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(\S+)$/i)?.[1] || '';
  const siteIdMatch = bearer.match(
    new RegExp(`^${BRANDING.KEY_PREFIXES.SERVER}_(s_[0-9a-hjkmnp-z]{16})_(.+)$`)
  );
  if (!siteIdMatch) {
    return errorResponse('unauthorized', 'Server key required', 401);
  }
  const publicSiteId = String(siteIdMatch[1]);
  const secret = String(siteIdMatch[2]);
  const keyHash = await sha256(secret);

  const site = await env.CORE.prepare('SELECT * FROM sites WHERE site_id = ?')
    .bind(publicSiteId)
    .first<Site>();
  if (!site || site.ingest_paused) {
    return errorResponse('not_found', 'Site not found', 404);
  }

  const keyRow = await env.CORE.prepare(`
    SELECT key_id FROM api_keys
    WHERE sid = ? AND kind = 'server' AND revoked_at IS NULL AND key_hash = ?
  `).bind(site.sid, keyHash).first<{ key_id: string }>();
  if (!keyRow) {
    return errorResponse('unauthorized', 'Invalid server key', 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return errorResponse('invalid_json', 'Invalid JSON', 400);
  }

  const allowed = new Set(['event', 'value', 'currency', 'visit_token', 'idempotency_key']);
  for (const k of Object.keys(body)) {
    if (!allowed.has(k)) {
      return errorResponse('unknown_field', `Unknown field: ${k}`, 400);
    }
  }

  const config = getConfig(env);
  const eventName = normalizeEventName(String(body.event || ''), config.limits.eventNameMaxLength);
  if (!eventName) {
    return errorResponse('invalid_event', 'Invalid event name', 400);
  }
  const idem = typeof body.idempotency_key === 'string' ? body.idempotency_key : '';
  if (!IDEM_RE.test(idem)) {
    return errorResponse('invalid_idempotency_key', 'idempotency_key required', 400);
  }
  if (typeof body.currency === 'string' && body.currency.toUpperCase() !== site.currency) {
    return errorResponse('currency_mismatch', 'Currency must match site currency', 422);
  }

  const valueX100 = body.value !== undefined ? normalizeValue(body.value as number) : null;
  const now = Math.floor(Date.now() / 1000);
  let attributed = false;
  let vhHex: string;
  let day = getLocalDate(now, site.tz);

  if (typeof body.visit_token === 'string' && body.visit_token) {
    const claims = await openVisitToken(env, body.visit_token, now);
    if (claims && claims.sid === site.sid) {
      attributed = true;
      vhHex = claims.vh;
      day = claims.day;
    } else {
      const dig = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`ua|${site.sid}|${day}|${idem}`)
      );
      vhHex = Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } else {
    const dig = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`ua|${site.sid}|${day}|${idem}`)
    );
    vhHex = Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const suffix = getPartitionSuffix(day);
  await ensurePartition(env.INGEST, suffix);
  const tables = partitionTables(suffix);
  const idemTable = `idem_${suffix}`;
  const vh = hexLit(vhHex);

  const inserted = await env.INGEST.prepare(
    `INSERT OR IGNORE INTO ${idemTable} (sid, idem) VALUES (?, ?)`
  ).bind(site.sid, idem).run();

  if (!inserted.meta.changes) {
    return Response.json({ accepted: true, attributed, deduped: true }, { status: 202 });
  }

  const goal = await env.CORE.prepare(
    `SELECT goal_id FROM goals WHERE sid = ? AND kind = 'event' AND active = 1 AND pattern = ? LIMIT 1`
  ).bind(site.sid, eventName).first<{ goal_id: number }>();

  const channel = attributed ? CONSTANTS.CHANNEL_DIRECT : '(unattributed)';

  await env.INGEST.batch([
    env.INGEST.prepare(`
      INSERT INTO ${tables.ev} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src)
      VALUES (?, ?, 1, ?, '/', ${vh}, 0, ?, ?, 1)
    `).bind(site.sid, now, eventName, goal?.goal_id ?? null, valueX100),
    env.INGEST.prepare(`
      INSERT INTO ${tables.vis} (sid, vh, first_ts, channel, source, medium, campaign, content, term, ref_host, entry_path, country, lang, device, browser, os)
      SELECT ?, ${vh}, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, '/', '', '', 'server', 'server', 'server'
      WHERE NOT EXISTS (SELECT 1 FROM ${tables.vis} WHERE sid = ? AND vh = ${vh})
    `).bind(site.sid, now, channel, site.sid),
  ]);

  await env.CORE.prepare(
    'UPDATE api_keys SET last_used_day = ? WHERE key_id = ?'
  ).bind(day, keyRow.key_id).run();

  return Response.json({ accepted: true, attributed, deduped: false }, { status: 202 });
}
