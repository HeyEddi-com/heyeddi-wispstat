import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { closeDay, rollupHourlyPartition } from '../src/cron/rollup';
import { runNightly } from '../src/cron';
import { ensurePartition, suffixFromDay } from '../src/lib/partitions';
import { getLocalDate } from '../src/lib/utils';
import { applySchema } from './schema';

const ctx = {
  waitUntil(promise: Promise<unknown>) {
    return promise;
  },
  passThroughOnException() {
    return undefined;
  },
} as unknown as ExecutionContext;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function cookieFrom(response: Response): string {
  const raw = response.headers.get('set-cookie') || '';
  return raw.split(';')[0] || '';
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', 'http://example.test');
  return worker.fetch(new Request(`http://example.test${path}`, { ...init, headers }), env, ctx);
}

describe('MVP flow', () => {
  let cookie = '';
  let siteId = '';
  let sid = 0;

  beforeAll(async () => {
    await applySchema();
  });

  it('rejects a bad setup token', async () => {
    const response = await call('/auth/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setup_token: 'nope', email: 'a@b.co', password: 'correct-horse' }),
    });
    expect(response.status).toBe(403);
  });

  it('claims the instance and creates a site', async () => {
    const response = await call('/auth/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        setup_token: 'a'.repeat(32),
        email: 'owner@example.com',
        password: 'correct-horse',
      }),
    });
    expect(response.status).toBe(200);
    cookie = cookieFrom(response);
    expect(cookie.startsWith('__Host-ws_session=')).toBe(true);

    const created = await call('/api/v1/sites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-ws-csrf': '1',
      },
      body: JSON.stringify({ name: 'Blog', domains: ['example.com'], tz: 'UTC', currency: 'USD' }),
    });
    expect(created.status).toBe(201);
    const body = await created.json() as { site_id: string; snippet: string };
    siteId = body.site_id;
    expect(body.snippet).toContain('/ws.js');
    expect(body.snippet).toContain(siteId);

    const row = await env.CORE.prepare('SELECT sid FROM sites WHERE site_id = ?').bind(siteId).first<{ sid: number }>();
    sid = row!.sid;
  });

  it('requires a session for the read API', async () => {
    const response = await call('/api/v1/sites');
    expect(response.status).toBe(401);
  });

  it('rolls a closed day up once and keeps the totals on a second run', async () => {
    const day = '2026-10-01';
    await ensurePartition(env.INGEST, suffixFromDay(day));
    const vh1 = crypto.getRandomValues(new Uint8Array(16));
    const vh2 = crypto.getRandomValues(new Uint8Array(16));
    const { ev, vis } = { ev: 'ev_20261001', vis: 'vis_20261001' };
    await env.INGEST.batch([
      env.INGEST.prepare(`INSERT INTO ${vis} (sid, vh, first_ts, channel, source, medium, campaign, entry_path, country, lang, device, browser, os) VALUES (?, ?, 100, 'Direct', '', '', '', '/', 'US', 'en', 'desktop', 'chrome', 'windows')`).bind(sid, vh1),
      env.INGEST.prepare(`INSERT INTO ${vis} (sid, vh, first_ts, channel, source, medium, campaign, entry_path, country, lang, device, browser, os) VALUES (?, ?, 100, 'Hacker News', 'news.ycombinator.com', '', '', '/', 'US', 'en', 'desktop', 'chrome', 'windows')`).bind(sid, vh2),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 100, 0, NULL, '/', ?, 1, NULL, NULL, 0)`).bind(sid, vh1),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 110, 0, NULL, '/pricing', ?, 0, NULL, NULL, 0)`).bind(sid, vh1),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 120, 0, NULL, '/', ?, 1, NULL, NULL, 0)`).bind(sid, vh2),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 130, 1, 'signup', '/', ?, 0, 7, 4990, 0)`).bind(sid, vh2),
    ]);

    const site = { sid, site_id: siteId, tz: 'UTC', name: 'Blog', digest_enabled: 0 };
    await closeDay(env, site, day);
    await closeDay(env, site, day);

    const total = await env.CORE.prepare(
      "SELECT pv, visitors, events FROM stats_daily WHERE sid = ? AND day = ? AND dim = 'total'"
    ).bind(sid, day).first<{ pv: number; visitors: number; events: number }>();
    expect(total).toEqual({ pv: 3, visitors: 2, events: 1 });

    const goal = await env.CORE.prepare(
      'SELECT converters, conversions, value_x100 FROM goals_daily WHERE sid = ? AND day = ? AND goal_id = 7'
    ).bind(sid, day).first<{ converters: number; conversions: number; value_x100: number }>();
    expect(goal).toEqual({ converters: 1, conversions: 1, value_x100: 4990 });

    const summary = await call(`/api/v1/sites/${siteId}/summary?from=2026-10-01&to=2026-10-01`, { headers: { cookie } });
    expect(summary.status).toBe(200);
    const summaryBody = await summary.json() as { data: { pv: number; visitors: number; revenue: number } };
    expect(summaryBody.data.pv).toBe(3);
    expect(summaryBody.data.visitors).toBe(2);
    expect(summaryBody.data.revenue).toBe(49.9);
  });

  it('guards CSV formula injection', async () => {
    await env.CORE.prepare(
      "INSERT INTO stats_daily (sid, day, dim, k, pv, visitors, events) VALUES (?, '2026-10-01', 'path', '=1+1', 1, 1, 0)"
    ).bind(sid).run();
    const response = await call(`/api/v1/sites/${siteId}/export?dataset=daily&format=csv&from=2026-10-01&to=2026-10-01`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("'=1+1");
  });

  it('accepts a beacon without setting a cookie', async () => {
    const response = await call('/e', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://example.com',
        'user-agent': UA,
        'cf-connecting-ip': '203.0.113.8',
      },
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/hello' }),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();

    const day = getLocalDate(Math.floor(Date.now() / 1000), 'UTC');
    const suffix = suffixFromDay(day);
    await rollupHourlyPartition(env, suffix);
    const once = await env.CORE.prepare('SELECT COALESCE(SUM(pv), 0) AS pv FROM stats_hourly WHERE sid = ?').bind(sid).first<{ pv: number }>();
    await rollupHourlyPartition(env, suffix);
    const twice = await env.CORE.prepare('SELECT COALESCE(SUM(pv), 0) AS pv FROM stats_hourly WHERE sid = ?').bind(sid).first<{ pv: number }>();
    expect(twice?.pv).toBe(once?.pv);
    expect(once?.pv).toBeGreaterThan(0);
  });

  it('skips nightly export when backup secrets are unset', async () => {
    const result = await runNightly(env);
    expect(result.status).toBe('skipped');
  });
});
