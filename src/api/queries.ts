/**
 * Read models over CORE rollups and the live INGEST partition.
 */

import type { Env, Site } from '../lib/types';
import { convertMinor } from '../lib/money';
import { fxTable } from './insights';
import { daysInclusive, isDay, previousRange, shiftDate } from '../lib/dates';
import { getLocalDate } from '../lib/utils';
import { errorResponse } from '../lib/utils';
import { partitionTables, suffixFromDay } from '../lib/partitions';

export interface Range {
  from: string;
  to: string;
}

export function resolveRange(url: URL, tz: string, nowSec = Math.floor(Date.now() / 1000)): Range | Response {
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  if ((from && !isDay(from)) || (to && !isDay(to))) {
    return errorResponse('invalid_range', 'Dates must be YYYY-MM-DD', 400);
  }
  const end = to || getLocalDate(nowSec, tz);
  const start = from || shiftDate(end, -6);
  if (start > end) return errorResponse('invalid_range', 'from is after to', 400);
  if (daysInclusive(start, end) > 400) return errorResponse('invalid_range', 'Range exceeds 400 days', 400);
  return { from: start, to: end };
}

const DIMS = new Set(['path', 'entry', 'ref_host', 'country', 'lang', 'device', 'browser', 'os', 'event']);
const METRICS = new Set(['pv', 'visitors', 'events', 'revenue']);
const GRAINS = new Set(['hour', 'day', 'week', 'month']);

export function envelope(site: Site, range: Range, data: unknown, grain: string | null, ttl: number) {
  return {
    site: { site_id: site.site_id, slug: site.slug },
    tz: site.tz,
    currency: site.currency,
    from: range.from,
    to: range.to,
    grain,
    data,
    generated_at: Math.floor(Date.now() / 1000),
    ttl,
  };
}

async function totals(env: Env, sid: number, range: Range) {
  return env.CORE.prepare(`
    SELECT COALESCE(SUM(pv), 0) AS pv,
           COALESCE(SUM(visitors), 0) AS visitors,
           COALESCE(SUM(events), 0) AS events
    FROM stats_daily
    WHERE sid = ? AND dim = 'total' AND day >= ? AND day <= ?
  `).bind(sid, range.from, range.to).first<{ pv: number; visitors: number; events: number }>();
}

async function goalTotals(env: Env, sid: number, range: Range) {
  return env.CORE.prepare(`
    SELECT COALESCE(SUM(conversions), 0) AS conversions,
           COALESCE(SUM(value_x100), 0) AS value_x100
    FROM goals_daily
    WHERE sid = ? AND day >= ? AND day <= ?
  `).bind(sid, range.from, range.to).first<{ conversions: number; value_x100: number }>();
}

function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export async function siteSummary(env: Env, site: Site, range: Range) {
  const current = await totals(env, site.sid, range);
  const goals = await goalTotals(env, site.sid, range);
  const prev = previousRange(range.from, range.to);
  const previous = await totals(env, site.sid, prev);
  const previousGoals = await goalTotals(env, site.sid, prev);
  const revenue = (goals?.value_x100 || 0) / 100;
  const previousRevenue = (previousGoals?.value_x100 || 0) / 100;
  const rates = await fxTable(env);
  const reportCurrency = (site.reporting_currency || site.currency || 'USD').toUpperCase();
  const reportingRevenue = convertMinor(Math.round(revenue * 100), site.currency || 'USD', reportCurrency, rates) / 100;
  return {
    visitors: current?.visitors || 0,
    pv: current?.pv || 0,
    events: current?.events || 0,
    conversions: goals?.conversions || 0,
    revenue,
    reporting_currency: reportCurrency,
    reporting_revenue: reportingRevenue,
    previous: {
      visitors: previous?.visitors || 0,
      pv: previous?.pv || 0,
      events: previous?.events || 0,
      conversions: previousGoals?.conversions || 0,
      revenue: previousRevenue,
    },
    delta: {
      visitors: delta(current?.visitors || 0, previous?.visitors || 0),
      pv: delta(current?.pv || 0, previous?.pv || 0),
      revenue: delta(revenue, previousRevenue),
    },
    sessions: site.sessions_enabled ? await sessionSummary(env, site.sid, range) : null,
  };
}

async function sessionSummary(env: Env, sid: number, range: Range) {
  const row = await env.CORE.prepare(`
    SELECT COALESCE(SUM(sessions), 0) AS sessions,
           COALESCE(SUM(pv), 0) AS pv,
           COALESCE(SUM(bounces), 0) AS bounces,
           COALESCE(SUM(dur_s_sum), 0) AS dur_s_sum,
           COALESCE(SUM(dur_n), 0) AS dur_n
    FROM sessions_daily
    WHERE sid = ? AND dim = 'total' AND day >= ? AND day <= ?
  `).bind(sid, range.from, range.to).first<{
    sessions: number;
    pv: number;
    bounces: number;
    dur_s_sum: number;
    dur_n: number;
  }>();
  const sessions = row?.sessions || 0;
  const durN = row?.dur_n || 0;
  return {
    approximate: true,
    sessions,
    pages_per_visit: sessions ? Math.round(((row?.pv || 0) / sessions) * 10) / 10 : 0,
    bounce_rate: sessions ? Math.round(((row?.bounces || 0) / sessions) * 1000) / 1000 : 0,
    avg_duration_s: durN ? Math.round((row?.dur_s_sum || 0) / durN) : null,
  };
}

export async function overview(env: Env, sites: Site[], range: Range) {
  const cards = [];
  for (const site of sites) {
    const summary = await siteSummary(env, site, range);
    const spark = await env.CORE.prepare(`
      SELECT day, visitors FROM stats_daily
      WHERE sid = ? AND dim = 'total' AND day >= ? AND day <= ?
      ORDER BY day
    `).bind(site.sid, range.from, range.to).all<{ day: string; visitors: number }>();
    cards.push({
      site_id: site.site_id,
      slug: site.slug,
      name: site.name,
      tz: site.tz,
      currency: site.currency,
      domains: JSON.parse(site.domains || '[]'),
      honor_dnt: site.honor_dnt,
      ingest_paused: site.ingest_paused,
      digest_enabled: site.digest_enabled,
      ...summary,
      sparkline: spark.results.map((row) => row.visitors),
    });
  }
  return cards;
}

export async function timeseries(env: Env, site: Site, range: Range, metric: string, grain: string) {
  if (!METRICS.has(metric)) return errorResponse('invalid_metric', 'Unknown metric', 400);
  if (!GRAINS.has(grain)) return errorResponse('invalid_grain', 'Unknown grain', 400);

  if (grain === 'hour') {
    const start = Math.floor(Date.parse(`${shiftDate(range.from, -1)}T00:00:00Z`) / 1000);
    const end = Math.floor(Date.parse(`${shiftDate(range.to, 2)}T00:00:00Z`) / 1000);
    const rows = await env.CORE.prepare(`
      SELECT hour_ts, pv, ev AS events, new_visitors AS visitors
      FROM stats_hourly
      WHERE sid = ? AND hour_ts >= ? AND hour_ts < ?
      ORDER BY hour_ts
    `).bind(site.sid, start, end).all<{ hour_ts: number; pv: number; events: number; visitors: number }>();
    return rows.results
      .filter((row) => {
        const day = getLocalDate(row.hour_ts, site.tz);
        return day >= range.from && day <= range.to;
      })
      .map((row) => ({
        t: row.hour_ts,
        value: metric === 'pv' ? row.pv : metric === 'events' ? row.events : metric === 'visitors' ? row.visitors : 0,
      }));
  }

  const column = metric === 'events' ? 'events' : metric === 'visitors' ? 'visitors' : 'pv';
  if (metric === 'revenue') {
    const rows = await env.CORE.prepare(`
      SELECT day, SUM(value_x100) AS value_x100
      FROM goals_daily
      WHERE sid = ? AND day >= ? AND day <= ?
      GROUP BY day ORDER BY day
    `).bind(site.sid, range.from, range.to).all<{ day: string; value_x100: number }>();
    return bucket(rows.results.map((row) => ({ day: row.day, value: row.value_x100 / 100 })), grain);
  }

  const rows = await env.CORE.prepare(`
    SELECT day, ${column} AS value
    FROM stats_daily
    WHERE sid = ? AND dim = 'total' AND day >= ? AND day <= ?
    ORDER BY day
  `).bind(site.sid, range.from, range.to).all<{ day: string; value: number }>();
  return bucket(rows.results, grain);
}

function bucket(rows: Array<{ day: string; value: number }>, grain: string) {
  if (grain === 'day') return rows.map((row) => ({ t: row.day, value: row.value }));
  const groups = new Map<string, number>();
  for (const row of rows) {
    const key = grain === 'month' ? row.day.slice(0, 7) : weekKey(row.day);
    groups.set(key, (groups.get(key) || 0) + row.value);
  }
  return [...groups.entries()].map(([t, value]) => ({ t, value }));
}

function weekKey(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

export async function breakdown(env: Env, site: Site, range: Range, dim: string, limit: number) {
  if (!DIMS.has(dim)) return errorResponse('invalid_dim', 'Unknown breakdown', 400);
  const rows = await env.CORE.prepare(`
    SELECT k, SUM(pv) AS pv, SUM(visitors) AS visitors, SUM(events) AS events
    FROM stats_daily
    WHERE sid = ? AND dim = ? AND day >= ? AND day <= ? AND k != ''
    GROUP BY k
    ORDER BY pv DESC, visitors DESC
    LIMIT ?
  `).bind(site.sid, dim, range.from, range.to, limit).all();
  return rows.results;
}

interface SourceTuple {
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  visitors: number;
  pv: number;
  converters: number;
  conversions: number;
  value_x100: number;
}

export async function sources(env: Env, site: Site, range: Range, level: string, goalId: number | null) {
  if (!['channel', 'source', 'campaign'].includes(level)) {
    return errorResponse('invalid_level', 'level must be channel, source, or campaign', 400);
  }
  const traffic = await env.CORE.prepare(`
    SELECT channel, source, medium, campaign, SUM(visitors) AS visitors, SUM(pv) AS pv
    FROM sources_daily
    WHERE sid = ? AND day >= ? AND day <= ?
    GROUP BY channel, source, medium, campaign
  `).bind(site.sid, range.from, range.to).all<SourceTuple>();

  const goals = await env.CORE.prepare(`
    SELECT channel, source, medium, campaign,
           SUM(converters) AS converters,
           SUM(conversions) AS conversions,
           SUM(value_x100) AS value_x100
    FROM goals_daily
    WHERE sid = ? AND day >= ? AND day <= ? AND (? IS NULL OR goal_id = ?)
    GROUP BY channel, source, medium, campaign
  `).bind(site.sid, range.from, range.to, goalId, goalId).all<SourceTuple>();

  const merged = new Map<string, SourceTuple>();
  const keyOf = (row: SourceTuple) => {
    if (level === 'channel') return row.channel;
    if (level === 'source') return `${row.channel}\t${row.source}\t${row.medium}`;
    return `${row.channel}\t${row.source}\t${row.medium}\t${row.campaign}`;
  };
  const add = (row: SourceTuple, field: 'traffic' | 'goals') => {
    const key = keyOf(row);
    const current = merged.get(key) || {
      channel: level === 'channel' ? row.channel : row.channel,
      source: level === 'channel' ? '' : row.source,
      medium: level === 'channel' ? '' : row.medium,
      campaign: level === 'campaign' ? row.campaign : '',
      visitors: 0,
      pv: 0,
      converters: 0,
      conversions: 0,
      value_x100: 0,
    };
    if (field === 'traffic') {
      current.visitors += row.visitors || 0;
      current.pv += row.pv || 0;
    } else {
      current.converters += row.converters || 0;
      current.conversions += row.conversions || 0;
      current.value_x100 += row.value_x100 || 0;
    }
    merged.set(key, current);
  };
  for (const row of traffic.results) add(row, 'traffic');
  for (const row of goals.results) add(row, 'goals');

  return [...merged.values()].map((row) => {
    const revenue = row.value_x100 / 100;
    return {
      channel: row.channel,
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      visitors: row.visitors,
      pv: row.pv,
      converters: row.converters,
      conv_rate: row.visitors ? row.converters / row.visitors : 0,
      conversions: row.conversions,
      value: revenue,
      revenue_per_visitor: row.visitors ? revenue / row.visitors : 0,
    };
  }).sort((a, b) => b.visitors - a.visitors);
}

export async function live(env: Env, site: Site, nowSec = Math.floor(Date.now() / 1000)) {
  const day = getLocalDate(nowSec, site.tz);
  const { ev } = partitionTables(suffixFromDay(day));
  const table = await env.INGEST.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).bind(ev).first();
  if (!table) return { pageviews: 0, events: 0, paths: [] as Array<{ path: string; pv: number }> };
  const since = nowSec - 1800;
  const counts = await env.INGEST.prepare(`
    SELECT SUM(CASE WHEN k = 0 THEN 1 ELSE 0 END) AS pageviews,
           SUM(CASE WHEN k = 1 THEN 1 ELSE 0 END) AS events
    FROM ${ev} WHERE sid = ? AND ts >= ?
  `).bind(site.sid, since).first<{ pageviews: number; events: number }>();
  const paths = await env.INGEST.prepare(`
    SELECT path, COUNT(*) AS pv FROM ${ev}
    WHERE sid = ? AND ts >= ? AND k = 0
    GROUP BY path ORDER BY pv DESC LIMIT 20
  `).bind(site.sid, since).all<{ path: string; pv: number }>();
  return {
    pageviews: counts?.pageviews || 0,
    events: counts?.events || 0,
    paths: paths.results,
  };
}

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  if (/[",\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  }
  return lines.join('\n');
}

export async function exportRows(env: Env, site: Site, range: Range, dataset: string) {
  if (dataset === 'daily') {
    const rows = await env.CORE.prepare(`
      SELECT day, dim, k, pv, visitors, events FROM stats_daily
      WHERE sid = ? AND day >= ? AND day <= ? ORDER BY day, dim, k LIMIT 50000
    `).bind(site.sid, range.from, range.to).all();
    return rows.results;
  }
  if (dataset === 'sources') {
    const rows = await env.CORE.prepare(`
      SELECT day, channel, source, medium, campaign, visitors, pv FROM sources_daily
      WHERE sid = ? AND day >= ? AND day <= ? ORDER BY day LIMIT 50000
    `).bind(site.sid, range.from, range.to).all();
    return rows.results;
  }
  if (dataset === 'goals') {
    const rows = await env.CORE.prepare(`
      SELECT day, goal_id, channel, source, medium, campaign, converters, conversions, value_x100
      FROM goals_daily
      WHERE sid = ? AND day >= ? AND day <= ? ORDER BY day LIMIT 50000
    `).bind(site.sid, range.from, range.to).all();
    return rows.results;
  }
  return errorResponse('invalid_dataset', 'dataset must be daily, sources, or goals', 400);
}

export async function budget(env: Env, nowSec = Math.floor(Date.now() / 1000)) {
  const start = nowSec - (nowSec % 86400);
  const usage = await env.CORE.prepare(`
    SELECT COALESCE(SUM(pv), 0) AS pv, COALESCE(SUM(ev), 0) AS ev
    FROM stats_hourly WHERE hour_ts >= ?
  `).bind(start).first<{ pv: number; ev: number }>();
  const shed = await env.CORE.prepare(
    "SELECT value FROM rollup_state WHERE job = 'shed' AND scope = 'collector'"
  ).first<{ value: string }>();
  const pv = usage?.pv || 0;
  const events = usage?.ev || 0;
  return {
    // Estimate from real traffic only (no fake floor). ~1.625 D1 writes per pv from ingest model.
    writes_estimate: Math.round(pv * 1.625 + events),
    write_cap: 100000,
    requests_estimate: pv + events,
    request_cap: 100000,
    shed: !!shed && Number(shed.value) > nowSec,
  };
}
