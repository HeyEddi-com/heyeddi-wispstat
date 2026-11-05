/**
 * Funnels, consented retention, and FX conversion.
 */

import type { Env, Site } from '../lib/types';
import { funnelCounts, type FunnelHit } from '../lib/funnel';
import { convertMinor } from '../lib/money';
import { listEventPartitions, partitionTables, suffixFromDay } from '../lib/partitions';

export async function listFunnels(env: Env, site: Site): Promise<Array<{ funnel_id: number; name: string; steps: string[] }>> {
  const rows = await env.CORE.prepare(
    'SELECT funnel_id, name, steps_json FROM funnels WHERE sid = ? ORDER BY funnel_id'
  ).bind(site.sid).all<{ funnel_id: number; name: string; steps_json: string }>();
  return rows.results.map((row) => ({
    funnel_id: row.funnel_id,
    name: row.name,
    steps: JSON.parse(row.steps_json) as string[],
  }));
}

export async function saveFunnel(env: Env, site: Site, name: string, steps: string[]): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.CORE.prepare(
    'INSERT INTO funnels (sid, name, steps_json, created_at) VALUES (?, ?, ?, ?)'
  ).bind(site.sid, name, JSON.stringify(steps), now).run();
  return Number(result.meta.last_row_id || 0);
}

export async function deleteFunnel(env: Env, site: Site, funnelId: number): Promise<void> {
  await env.CORE.prepare('DELETE FROM funnels WHERE sid = ? AND funnel_id = ?').bind(site.sid, funnelId).run();
}

export async function funnelReport(env: Env, site: Site, steps: string[], from: string, to: string): Promise<{ steps: string[]; counts: number[] }> {
  const hits: FunnelHit[] = [];
  const start = suffixFromDay(from);
  const end = suffixFromDay(to);
  const suffixes = (await listEventPartitions(env.INGEST))
    .filter((suffix) => suffix >= start && suffix <= end)
    .slice(0, 14);
  for (const suffix of suffixes) {
    const table = partitionTables(suffix).ev;
    const rows = await env.INGEST.prepare(
      `SELECT hex(vh) AS vh, name, ts FROM ${table} WHERE sid = ? AND k = 1 AND name IS NOT NULL ORDER BY ts LIMIT 20000`
    ).bind(site.sid).all<{ vh: string; name: string; ts: number }>();
    for (const row of rows.results) {
      if (row.name) hits.push({ vh: row.vh, name: row.name, ts: row.ts });
    }
  }
  return { steps, counts: funnelCounts(steps, hits) };
}

export async function retentionReport(env: Env, site: Site): Promise<{
  mode: 'consented';
  visitors: number;
  returning: number;
  cohorts: Array<{ first_day: string; visitors: number; returning: number }>;
}> {
  const totals = await env.CORE.prepare(`
    SELECT COUNT(*) AS visitors,
           SUM(CASE WHEN active_days > 1 THEN 1 ELSE 0 END) AS returning
    FROM consented_visitors WHERE sid = ?
  `).bind(site.sid).first<{ visitors: number; returning: number }>();
  const cohorts = await env.CORE.prepare(`
    SELECT first_day,
           COUNT(*) AS visitors,
           SUM(CASE WHEN active_days > 1 THEN 1 ELSE 0 END) AS returning
    FROM consented_visitors
    WHERE sid = ?
    GROUP BY first_day
    ORDER BY first_day DESC
    LIMIT 90
  `).bind(site.sid).all<{ first_day: string; visitors: number; returning: number }>();
  return {
    mode: 'consented',
    visitors: totals?.visitors || 0,
    returning: totals?.returning || 0,
    cohorts: cohorts.results,
  };
}

export async function fxTable(env: Env): Promise<Record<string, number>> {
  const rows = await env.CORE.prepare('SELECT code, usd_per_unit FROM fx_rates').all<{ code: string; usd_per_unit: number }>();
  const table: Record<string, number> = { USD: 1 };
  for (const row of rows.results) table[row.code] = row.usd_per_unit;
  return table;
}

export function convertSiteAmount(amount: number, site: Site, table: Record<string, number>): { amount: number; currency: string } {
  const currency = (site.reporting_currency || site.currency || 'USD').toUpperCase();
  return {
    amount: convertMinor(amount, site.currency || 'USD', currency, table),
    currency,
  };
}
