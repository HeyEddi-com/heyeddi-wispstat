/**
 * Aggregate click heat (viewport grid) + scroll depth — no screenshots/replay.
 */

import type { Env, Site } from '../lib/types';
import { errorResponse, getLocalDate } from '../lib/utils';
import { partitionTables, suffixFromDay } from '../lib/partitions';

export const HEAT_GRID = 12;

export function parseHeatName(name: string): { gx: number; gy: number } | null {
  const match = /^hm\.(\d{1,2})\.(\d{1,2})$/.exec(name);
  if (!match) return null;
  const gx = Number(match[1]);
  const gy = Number(match[2]);
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return null;
  if (gx < 0 || gy < 0 || gx >= HEAT_GRID || gy >= HEAT_GRID) return null;
  return { gx, gy };
}

export function parseScrollName(name: string): number | null {
  const match = /^scroll\.(25|50|75|100)$/.exec(name);
  if (!match) return null;
  return Number(match[1]);
}

async function partitionExists(env: Env, ev: string): Promise<boolean> {
  const row = await env.INGEST.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).bind(ev).first();
  return Boolean(row);
}

export function parseHeatQuery(url: URL, site: Site, nowSec = Math.floor(Date.now() / 1000)) {
  const day = url.searchParams.get('day') || getLocalDate(nowSec, site.tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return errorResponse('invalid_day', 'day must be YYYY-MM-DD', 400);
  }
  const path = url.searchParams.get('path') || undefined;
  if (path && (!path.startsWith('/') || path.length > 256)) {
    return errorResponse('invalid_path', 'path must start with /', 400);
  }
  return { day, path };
}

export async function heatmapForDay(env: Env, site: Site, day: string, pathFilter?: string) {
  const { ev } = partitionTables(suffixFromDay(day));
  const cells = new Map<string, number>();
  const scrolls = new Map<number, number>();
  const pathCounts = new Map<string, number>();
  let source: 'raw' | 'rollup' = 'rollup';

  if (await partitionExists(env, ev)) {
    source = 'raw';
    const rows = await env.INGEST.prepare(`
      SELECT name, path, COUNT(*) AS n
      FROM ${ev}
      WHERE sid = ? AND k = 1 AND name IS NOT NULL
        AND (name LIKE 'hm.%' OR name LIKE 'scroll.%')
        AND (? IS NULL OR path = ?)
      GROUP BY name, path
      LIMIT 5000
    `).bind(site.sid, pathFilter ?? null, pathFilter ?? null).all<{
      name: string;
      path: string;
      n: number;
    }>();

    for (const row of rows.results) {
      const heat = parseHeatName(row.name);
      if (heat) {
        const key = `${row.path}\t${heat.gx}\t${heat.gy}`;
        cells.set(key, (cells.get(key) || 0) + row.n);
        pathCounts.set(row.path, (pathCounts.get(row.path) || 0) + row.n);
        continue;
      }
      const depth = parseScrollName(row.name);
      if (depth != null && (!pathFilter || row.path === pathFilter)) {
        scrolls.set(depth, (scrolls.get(depth) || 0) + row.n);
        pathCounts.set(row.path, (pathCounts.get(row.path) || 0) + row.n);
      }
    }
  } else {
    const heatRows = await env.CORE.prepare(`
      SELECT path, gx, gy, clicks FROM heat_daily
      WHERE sid = ? AND day = ? AND (? IS NULL OR path = ?)
    `).bind(site.sid, day, pathFilter ?? null, pathFilter ?? null).all<{
      path: string;
      gx: number;
      gy: number;
      clicks: number;
    }>();
    for (const row of heatRows.results) {
      const key = `${row.path}\t${row.gx}\t${row.gy}`;
      cells.set(key, (cells.get(key) || 0) + row.clicks);
      pathCounts.set(row.path, (pathCounts.get(row.path) || 0) + row.clicks);
    }
    const scrollRows = await env.CORE.prepare(`
      SELECT path, depth, events FROM scroll_daily
      WHERE sid = ? AND day = ? AND (? IS NULL OR path = ?)
    `).bind(site.sid, day, pathFilter ?? null, pathFilter ?? null).all<{
      path: string;
      depth: number;
      events: number;
    }>();
    for (const row of scrollRows.results) {
      scrolls.set(row.depth, (scrolls.get(row.depth) || 0) + row.events);
      pathCounts.set(row.path, (pathCounts.get(row.path) || 0) + row.events);
    }
  }

  const focusPath = pathFilter || [...pathCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '/';
  const grid: Array<{ gx: number; gy: number; clicks: number }> = [];
  let max = 0;
  for (const [key, clicks] of cells) {
    const [p, gx, gy] = key.split('\t');
    if (p !== focusPath) continue;
    max = Math.max(max, clicks);
    grid.push({ gx: Number(gx), gy: Number(gy), clicks });
  }

  return {
    day,
    path: focusPath,
    grid_size: HEAT_GRID,
    source,
    max_clicks: max,
    cells: grid.sort((a, b) => b.clicks - a.clicks),
    scroll_depth: [25, 50, 75, 100].map((depth) => ({
      depth,
      events: scrolls.get(depth) || 0,
    })),
    paths: [...pathCounts.entries()]
      .map(([path, events]) => ({ path, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 40),
  };
}
