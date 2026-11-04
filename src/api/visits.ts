/**
 * Same-day visit explorer — raw partition timelines (no replay).
 */

import type { Env, Site } from '../lib/types';
import { errorResponse, getLocalDate } from '../lib/utils';
import { partitionTables, suffixFromDay } from '../lib/partitions';

const SESSION_GAP_SEC = 30 * 60;
const MAX_VISITS = 100;
const MAX_EVENTS = 500;

export interface VisitFilters {
  day: string;
  vh?: string;
  hasEvent?: string;
  missingEvent?: string;
  minDuration?: number;
  limit?: number;
}

export interface VisitRow {
  vh: string;
  session_index: number;
  start_ts: number;
  end_ts: number;
  duration_s: number;
  pv: number;
  events: number;
  entry_path: string;
  exit_path: string;
  channel: string | null;
  source: string | null;
  country: string | null;
  device: string | null;
  event_names: string[];
}

export interface TimelineItem {
  ts: number;
  kind: 'pv' | 'ev';
  name: string | null;
  path: string;
}

function hexOf(blob: ArrayBuffer | Uint8Array | string): string {
  if (typeof blob === 'string') {
    // D1 sometimes returns hex already
    if (/^[0-9a-f]+$/i.test(blob)) return blob.toLowerCase();
    return '';
  }
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function partitionExists(env: Env, ev: string): Promise<boolean> {
  const row = await env.INGEST.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).bind(ev).first();
  return Boolean(row);
}

function splitSessions<T extends { ts: number }>(rows: T[]): T[][] {
  if (rows.length === 0) return [];
  const sessions: T[][] = [];
  let current: T[] = [rows[0]!];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const prev = current[current.length - 1]!;
    if (row.ts - prev.ts > SESSION_GAP_SEC) {
      sessions.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  sessions.push(current);
  return sessions;
}

export function parseVisitFilters(url: URL, site: Site, nowSec = Math.floor(Date.now() / 1000)): VisitFilters | Response {
  const day = url.searchParams.get('day') || getLocalDate(nowSec, site.tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return errorResponse('invalid_day', 'day must be YYYY-MM-DD', 400);
  }
  const vh = url.searchParams.get('vh') || undefined;
  if (vh && !/^[0-9a-f]{16,64}$/i.test(vh)) {
    return errorResponse('invalid_vh', 'vh must be hex', 400);
  }
  const minRaw = url.searchParams.get('min_duration');
  const minDuration = minRaw != null && minRaw !== '' ? Number(minRaw) : undefined;
  if (minDuration !== undefined && (!Number.isFinite(minDuration) || minDuration < 0 || minDuration > 86400)) {
    return errorResponse('invalid_min_duration', 'min_duration must be 0–86400', 400);
  }
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(MAX_VISITS, Math.max(1, Number(limitRaw) || MAX_VISITS)) : MAX_VISITS;
  return {
    day,
    vh: vh?.toLowerCase(),
    hasEvent: url.searchParams.get('has_event') || undefined,
    missingEvent: url.searchParams.get('missing_event') || undefined,
    minDuration,
    limit,
  };
}

export async function listVisits(env: Env, site: Site, filters: VisitFilters) {
  const { ev, vis } = partitionTables(suffixFromDay(filters.day));
  if (!(await partitionExists(env, ev))) {
    return { day: filters.day, data: [] as VisitRow[], typical_paths: [] as Array<{ path: string; visits: number }> };
  }

  const eventRows = await env.INGEST.prepare(`
    SELECT hex(vh) AS vh, ts, k, name, path
    FROM ${ev}
    WHERE sid = ?
    ORDER BY vh, ts, id
    LIMIT 20000
  `).bind(site.sid).all<{ vh: string; ts: number; k: number; name: string | null; path: string }>();

  const visRows = await env.INGEST.prepare(`
    SELECT hex(vh) AS vh, channel, source, country, device, entry_path
    FROM ${vis}
    WHERE sid = ?
  `).bind(site.sid).all<{
    vh: string;
    channel: string;
    source: string | null;
    country: string | null;
    device: string | null;
    entry_path: string;
  }>();

  const meta = new Map(visRows.results.map((row) => [row.vh.toLowerCase(), row]));
  const byVh = new Map<string, Array<{ ts: number; k: number; name: string | null; path: string }>>();
  for (const row of eventRows.results) {
    const key = row.vh.toLowerCase();
    if (filters.vh && key !== filters.vh) continue;
    const list = byVh.get(key) || [];
    list.push(row);
    byVh.set(key, list);
  }

  const visits: VisitRow[] = [];
  const pathCounts = new Map<string, number>();

  for (const [vh, rows] of byVh) {
    const sessions = splitSessions(rows);
    sessions.forEach((session, sessionIndex) => {
      const start = session[0]!.ts;
      const end = session[session.length - 1]!.ts;
      const duration = Math.max(0, end - start);
      const names = [...new Set(session.filter((r) => r.k === 1 && r.name).map((r) => r.name!))];
      const pv = session.filter((r) => r.k === 0).length;
      const events = session.filter((r) => r.k === 1).length;
      const entry = session.find((r) => r.k === 0)?.path || session[0]!.path;
      const exit = [...session].reverse().find((r) => r.k === 0)?.path || session[session.length - 1]!.path;

      if (filters.minDuration !== undefined && duration < filters.minDuration) return;
      if (filters.hasEvent) {
        const needle = filters.hasEvent.toLowerCase();
        if (!names.some((n) => n === needle || n.startsWith(`${needle}:`) || n.startsWith(`${needle}.`))) return;
      }
      if (filters.missingEvent) {
        const needle = filters.missingEvent.toLowerCase();
        if (names.some((n) => n === needle || n.startsWith(`${needle}:`) || n.startsWith(`${needle}.`))) return;
      }

      const info = meta.get(vh);
      visits.push({
        vh,
        session_index: sessionIndex,
        start_ts: start,
        end_ts: end,
        duration_s: duration,
        pv,
        events,
        entry_path: entry,
        exit_path: exit,
        channel: info?.channel ?? null,
        source: info?.source ?? null,
        country: info?.country ?? null,
        device: info?.device ?? null,
        event_names: names,
      });

      for (const step of session.filter((r) => r.k === 0)) {
        pathCounts.set(step.path, (pathCounts.get(step.path) || 0) + 1);
      }
    });
  }

  visits.sort((a, b) => b.start_ts - a.start_ts);
  const limited = visits.slice(0, filters.limit || MAX_VISITS);
  const typical_paths = [...pathCounts.entries()]
    .map(([path, count]) => ({ path, visits: count }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 25);

  return { day: filters.day, data: limited, typical_paths, total_matched: visits.length };
}

export async function visitTimeline(
  env: Env,
  site: Site,
  day: string,
  vh: string,
  sessionIndex: number | null
) {
  const { ev, vis } = partitionTables(suffixFromDay(day));
  if (!(await partitionExists(env, ev))) {
    return { day, vh, session_index: 0, timeline: [] as TimelineItem[], meta: null };
  }

  const rows = await env.INGEST.prepare(`
    SELECT ts, k, name, path
    FROM ${ev}
    WHERE sid = ? AND hex(vh) = ?
    ORDER BY ts, id
    LIMIT ?
  `).bind(site.sid, vh.toUpperCase(), MAX_EVENTS).all<{
    ts: number;
    k: number;
    name: string | null;
    path: string;
  }>();

  // SQLite hex() is uppercase; also try lowercase bind via OR
  let list = rows.results;
  if (list.length === 0) {
    const again = await env.INGEST.prepare(`
      SELECT ts, k, name, path
      FROM ${ev}
      WHERE sid = ? AND lower(hex(vh)) = ?
      ORDER BY ts, id
      LIMIT ?
    `).bind(site.sid, vh.toLowerCase(), MAX_EVENTS).all<{
      ts: number;
      k: number;
      name: string | null;
      path: string;
    }>();
    list = again.results;
  }

  const sessions = splitSessions(list);
  const idx = sessionIndex == null ? 0 : Math.min(Math.max(0, sessionIndex), Math.max(0, sessions.length - 1));
  const session = sessions[idx] || [];
  const timeline: TimelineItem[] = session.map((row) => ({
    ts: row.ts,
    kind: row.k === 0 ? 'pv' : 'ev',
    name: row.name,
    path: row.path,
  }));

  const meta = await env.INGEST.prepare(`
    SELECT channel, source, medium, campaign, ref_host, entry_path, country, lang, device, browser, os
    FROM ${vis}
    WHERE sid = ? AND lower(hex(vh)) = ?
  `).bind(site.sid, vh.toLowerCase()).first();

  return {
    day,
    vh: vh.toLowerCase(),
    session_index: idx,
    session_count: sessions.length,
    timeline,
    meta,
  };
}

// silence unused in some bundlers
void hexOf;
