/**
 * Incremental hourly rollups and idempotent local-day close.
 * Aggregation runs in INGEST. Results are written to CORE.
 */

import type { Env } from '../lib/types';
import { shiftDate } from '../lib/dates';
import { getLocalDate } from '../lib/utils';
import {
  dayFromSuffix,
  ensurePartition,
  listEventPartitions,
  partitionTables,
  suffixFromDay,
} from '../lib/partitions';
import { precreateSalts } from '../lib/salt';
import { CONSTANTS } from '../../wispstat.config';

const TOP_N = 50;

interface SiteRow {
  sid: number;
  site_id: string;
  tz: string;
  name: string;
  digest_enabled: number;
}

interface DimRow {
  k: string;
  pv: number;
  visitors: number;
  events: number;
}

interface SourceRow {
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  visitors: number;
  pv: number;
}

interface GoalRow {
  goal_id: number;
  channel: string;
  source: string;
  medium: string;
  campaign: string;
  converters: number;
  conversions: number;
  value_x100: number;
}

export async function listSites(env: Env): Promise<SiteRow[]> {
  const rows = await env.CORE.prepare(
    'SELECT sid, site_id, tz, name, digest_enabled FROM sites'
  ).all<SiteRow>();
  return rows.results;
}

async function putState(env: Env, job: string, scope: string, value: string): Promise<void> {
  await env.CORE.prepare(
    `INSERT INTO rollup_state (job, scope, value) VALUES (?, ?, ?)
     ON CONFLICT(job, scope) DO UPDATE SET value = excluded.value`
  ).bind(job, scope, value).run();
}

async function runChunked(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += 40) {
    const chunk = statements.slice(i, i + 40);
    if (chunk.length > 0) await db.batch(chunk);
  }
}

export async function rollupHourlyPartition(env: Env, suffix: string): Promise<number> {
  const { ev } = partitionTables(suffix);
  const scope = `ev_${suffix}`;
  const mark = await env.CORE.prepare(
    "SELECT value FROM rollup_state WHERE job = 'hourly' AND scope = ?"
  ).bind(scope).first<{ value: string }>();
  const watermark = Number(mark?.value || '0');

  const maxRow = await env.INGEST.prepare(
    `SELECT COALESCE(MAX(id), 0) AS max_id FROM ${ev} WHERE id > ?`
  ).bind(watermark).first<{ max_id: number }>();
  const maxId = Number(maxRow?.max_id || 0);
  if (maxId <= watermark) return 0;

  const grouped = await env.INGEST.prepare(`
    SELECT sid,
           (ts / 3600) * 3600 AS hour_ts,
           SUM(CASE WHEN k = 0 THEN 1 ELSE 0 END) AS pv,
           SUM(CASE WHEN k = 1 THEN 1 ELSE 0 END) AS ev,
           SUM(CASE WHEN nv = 1 THEN 1 ELSE 0 END) AS new_visitors
    FROM ${ev}
    WHERE id > ? AND id <= ?
    GROUP BY sid, hour_ts
  `).bind(watermark, maxId).all<{
    sid: number;
    hour_ts: number;
    pv: number;
    ev: number;
    new_visitors: number;
  }>();

  const writes = grouped.results.map((row) =>
    env.CORE.prepare(`
      INSERT INTO stats_hourly (sid, hour_ts, pv, ev, new_visitors)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sid, hour_ts) DO UPDATE SET
        pv = pv + excluded.pv,
        ev = ev + excluded.ev,
        new_visitors = new_visitors + excluded.new_visitors
    `).bind(row.sid, row.hour_ts, row.pv, row.ev, row.new_visitors)
  );
  writes.push(
    env.CORE.prepare(
      `INSERT INTO rollup_state (job, scope, value) VALUES ('hourly', ?, ?)
       ON CONFLICT(job, scope) DO UPDATE SET value = excluded.value`
    ).bind(scope, String(maxId))
  );
  await runChunked(env.CORE, writes);
  return grouped.results.length;
}

function collapse(rows: DimRow[]): DimRow[] {
  const sorted = [...rows].sort((a, b) => b.pv - a.pv || b.visitors - a.visitors || b.events - a.events);
  if (sorted.length <= TOP_N) return sorted;
  const head = sorted.slice(0, TOP_N);
  const other = sorted.slice(TOP_N).reduce<DimRow>((acc, row) => ({
    k: CONSTANTS.DIM_OTHER,
    pv: acc.pv + row.pv,
    visitors: acc.visitors + row.visitors,
    events: acc.events + row.events,
  }), { k: CONSTANTS.DIM_OTHER, pv: 0, visitors: 0, events: 0 });
  head.push(other);
  return head;
}

export async function closeDay(env: Env, site: SiteRow, day: string): Promise<void> {
  const suffix = suffixFromDay(day);
  const { ev, vis } = partitionTables(suffix);
  const exists = await env.INGEST.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).bind(ev).first();

  const statements: D1PreparedStatement[] = [
    env.CORE.prepare('DELETE FROM stats_daily WHERE sid = ? AND day = ?').bind(site.sid, day),
    env.CORE.prepare('DELETE FROM sources_daily WHERE sid = ? AND day = ?').bind(site.sid, day),
    env.CORE.prepare('DELETE FROM goals_daily WHERE sid = ? AND day = ?').bind(site.sid, day),
  ];

  if (exists) {
    const total = await env.INGEST.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN k = 0 THEN 1 ELSE 0 END), 0) AS pv,
        COALESCE(SUM(CASE WHEN k = 1 THEN 1 ELSE 0 END), 0) AS events,
        (SELECT COUNT(*) FROM ${vis} WHERE sid = ?) AS visitors
      FROM ${ev} WHERE sid = ?
    `).bind(site.sid, site.sid).first<{ pv: number; events: number; visitors: number }>();

    statements.push(env.CORE.prepare(`
      INSERT INTO stats_daily (sid, day, dim, k, pv, visitors, events)
      VALUES (?, ?, 'total', '', ?, ?, ?)
    `).bind(site.sid, day, total?.pv || 0, total?.visitors || 0, total?.events || 0));

    const dims: Array<{ dim: string; sql: string }> = [
      {
        dim: 'path',
        sql: `SELECT path AS k,
          SUM(CASE WHEN k = 0 THEN 1 ELSE 0 END) AS pv,
          COUNT(DISTINCT vh) AS visitors,
          SUM(CASE WHEN k = 1 THEN 1 ELSE 0 END) AS events
          FROM ${ev} WHERE sid = ? GROUP BY path`,
      },
      {
        dim: 'event',
        sql: `SELECT COALESCE(name, '') AS k,
          0 AS pv,
          COUNT(DISTINCT vh) AS visitors,
          COUNT(*) AS events
          FROM ${ev} WHERE sid = ? AND k = 1 GROUP BY name`,
      },
    ];
    const visitorDims = ['entry_path', 'ref_host', 'country', 'device', 'browser', 'os', 'lang'] as const;
    const dimName: Record<string, string> = {
      entry_path: 'entry',
      ref_host: 'ref_host',
      country: 'country',
      device: 'device',
      browser: 'browser',
      os: 'os',
      lang: 'lang',
    };

    for (const spec of dims) {
      const rows = await env.INGEST.prepare(spec.sql).bind(site.sid).all<DimRow>();
      for (const row of collapse(rows.results)) {
        statements.push(env.CORE.prepare(`
          INSERT INTO stats_daily (sid, day, dim, k, pv, visitors, events)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(site.sid, day, spec.dim, row.k || '', row.pv || 0, row.visitors || 0, row.events || 0));
      }
    }

    for (const column of visitorDims) {
      const rows = await env.INGEST.prepare(`
        SELECT COALESCE(${column}, '') AS k, 0 AS pv, COUNT(*) AS visitors, 0 AS events
        FROM ${vis} WHERE sid = ? GROUP BY ${column}
      `).bind(site.sid).all<DimRow>();
      for (const row of collapse(rows.results)) {
        statements.push(env.CORE.prepare(`
          INSERT INTO stats_daily (sid, day, dim, k, pv, visitors, events)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(site.sid, day, dimName[column], row.k || '', 0, row.visitors || 0, 0));
      }
    }

    const sources = await env.INGEST.prepare(`
      SELECT v.channel AS channel,
             COALESCE(v.source, '') AS source,
             COALESCE(v.medium, '') AS medium,
             COALESCE(v.campaign, '') AS campaign,
             COUNT(DISTINCT v.vh) AS visitors,
             SUM(CASE WHEN e.k = 0 THEN 1 ELSE 0 END) AS pv
      FROM ${vis} v
      LEFT JOIN ${ev} e ON e.sid = v.sid AND e.vh = v.vh
      WHERE v.sid = ?
      GROUP BY v.channel, COALESCE(v.source, ''), COALESCE(v.medium, ''), COALESCE(v.campaign, '')
    `).bind(site.sid).all<SourceRow>();

    for (const row of sources.results) {
      statements.push(env.CORE.prepare(`
        INSERT INTO sources_daily (sid, day, channel, source, medium, campaign, visitors, pv)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        site.sid, day, row.channel, row.source || '', row.medium || '', row.campaign || '',
        row.visitors || 0, row.pv || 0
      ));
    }

    const goals = await env.INGEST.prepare(`
      SELECT e.goal_id AS goal_id,
             COALESCE(v.channel, ?) AS channel,
             COALESCE(v.source, '') AS source,
             COALESCE(v.medium, '') AS medium,
             COALESCE(v.campaign, '') AS campaign,
             COUNT(DISTINCT e.vh) AS converters,
             COUNT(*) AS conversions,
             COALESCE(SUM(e.value_x100), 0) AS value_x100
      FROM ${ev} e
      LEFT JOIN ${vis} v ON v.sid = e.sid AND v.vh = e.vh
      WHERE e.sid = ? AND e.goal_id IS NOT NULL
      GROUP BY e.goal_id, COALESCE(v.channel, ?), COALESCE(v.source, ''), COALESCE(v.medium, ''), COALESCE(v.campaign, '')
    `).bind(CONSTANTS.CHANNEL_UNKNOWN, site.sid, CONSTANTS.CHANNEL_UNKNOWN).all<GoalRow>();

    for (const row of goals.results) {
      statements.push(env.CORE.prepare(`
        INSERT INTO goals_daily (
          sid, day, goal_id, channel, source, medium, campaign, converters, conversions, value_x100
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        site.sid, day, row.goal_id, row.channel, row.source || '', row.medium || '', row.campaign || '',
        row.converters || 0, row.conversions || 0, row.value_x100 || 0
      ));
    }
  }

  await runChunked(env.CORE, statements);
  await putState(env, 'day_close', `${site.sid}:${day}`, '1');
}

export async function isDayClosed(env: Env, sid: number, day: string): Promise<boolean> {
  const row = await env.CORE.prepare(
    "SELECT value FROM rollup_state WHERE job = 'day_close' AND scope = ?"
  ).bind(`${sid}:${day}`).first();
  return !!row;
}

async function dropPartition(env: Env, suffix: string): Promise<void> {
  const { ev, vis } = partitionTables(suffix);
  await env.INGEST.batch([
    env.INGEST.prepare(`DROP TABLE IF EXISTS ${ev}`),
    env.INGEST.prepare(`DROP TABLE IF EXISTS ${vis}`),
  ]);
  await env.CORE.prepare(
    "DELETE FROM rollup_state WHERE job = 'hourly' AND scope = ?"
  ).bind(`ev_${suffix}`).run();
}

export async function runHourly(env: Env, nowSec = Math.floor(Date.now() / 1000)): Promise<void> {
  const sites = await listSites(env);
  for (const site of sites) {
    const today = getLocalDate(nowSec, site.tz);
    const tomorrow = getLocalDate(nowSec + 86400, site.tz);
    await ensurePartition(env.INGEST, suffixFromDay(today));
    await ensurePartition(env.INGEST, suffixFromDay(tomorrow));
  }

  const suffixes = await listEventPartitions(env.INGEST);
  for (const suffix of suffixes) {
    await rollupHourlyPartition(env, suffix);
  }

  for (const site of sites) {
    const cutoff = getLocalDate(nowSec - 3600, site.tz);
    for (const suffix of suffixes) {
      const day = dayFromSuffix(suffix);
      if (day < cutoff) await closeDay(env, site, day);
    }
  }

  for (const suffix of suffixes) {
    const day = dayFromSuffix(suffix);
    const stillNeeded = sites.some((site) => day > shiftDate(getLocalDate(nowSec, site.tz), -3));
    const closedEverywhere = sites.length > 0 && (
      await Promise.all(sites.map((site) => isDayClosed(env, site.sid, day)))
    ).every(Boolean);
    if (!stillNeeded && closedEverywhere) await dropPartition(env, suffix);
  }

  await precreateSalts(env, sites);

  const hourlyCutoff = nowSec - 90 * 86400;
  await env.CORE.prepare('DELETE FROM stats_hourly WHERE hour_ts < ?').bind(hourlyCutoff).run();
  await env.CORE.prepare('DELETE FROM login_sessions WHERE expires_at < ?').bind(nowSec).run();
  await putState(env, 'hourly', 'last_run', String(nowSec));
}
