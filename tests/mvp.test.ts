import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { closeDay, rollupHourlyPartition } from '../src/cron/rollup';
import { runNightly } from '../src/cron';
import { ensurePartition, suffixFromDay } from '../src/lib/partitions';
import { getLocalDate } from '../src/lib/utils';
import { applySchema } from './schema';
import { TEST_UA, call, ensureOwnerSession, ensureSite } from './helpers';

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

  it('claims or logs in and ensures a site', async () => {
    cookie = await ensureOwnerSession();
    expect(cookie.startsWith('__Host-ws_session=')).toBe(true);

    const site = await ensureSite(cookie, { name: 'Blog', domain: 'example.com' });
    siteId = site.siteId;
    sid = site.sid;
    if (site.snippet) {
      expect(site.snippet).toContain('/ws.js');
      expect(site.snippet).toContain(siteId);
    }

    const listed = await call('/api/v1/sites', { headers: { cookie } });
    expect(listed.status).toBe(200);
  });

  it('requires a session for the read API', async () => {
    const response = await call('/api/v1/sites');
    expect(response.status).toBe(401);
  });

  it('rolls a closed day up once and keeps the totals on a second run', async () => {
    expect(sid).toBeGreaterThan(0);
    const day = '2026-10-01';
    await ensurePartition(env.INGEST, suffixFromDay(day));
    await env.INGEST.batch([
      env.INGEST.prepare(`DELETE FROM ev_20261001 WHERE sid = ?`).bind(sid),
      env.INGEST.prepare(`DELETE FROM vis_20261001 WHERE sid = ?`).bind(sid),
    ]);
    await env.CORE.prepare('DELETE FROM stats_daily WHERE sid = ? AND day = ?').bind(sid, day).run();
    await env.CORE.prepare('DELETE FROM goals_daily WHERE sid = ? AND day = ?').bind(sid, day).run();
    await env.CORE.prepare("DELETE FROM rollup_state WHERE job = 'day_close' AND scope = ?")
      .bind(`${sid}:${day}`)
      .run();

    const vh1 = crypto.getRandomValues(new Uint8Array(16));
    const vh2 = crypto.getRandomValues(new Uint8Array(16));
    await env.INGEST.batch([
      env.INGEST.prepare(`INSERT INTO vis_20261001 (sid, vh, first_ts, channel, source, medium, campaign, entry_path, country, lang, device, browser, os) VALUES (?, ?, 100, 'Direct', '', '', '', '/', 'US', 'en', 'desktop', 'chrome', 'windows')`).bind(sid, vh1),
      env.INGEST.prepare(`INSERT INTO vis_20261001 (sid, vh, first_ts, channel, source, medium, campaign, entry_path, country, lang, device, browser, os) VALUES (?, ?, 100, 'Hacker News', 'news.ycombinator.com', '', '', '/', 'US', 'en', 'desktop', 'chrome', 'windows')`).bind(sid, vh2),
      env.INGEST.prepare(`INSERT INTO ev_20261001 (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 100, 0, NULL, '/', ?, 1, NULL, NULL, 0)`).bind(sid, vh1),
      env.INGEST.prepare(`INSERT INTO ev_20261001 (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 110, 0, NULL, '/pricing', ?, 0, NULL, NULL, 0)`).bind(sid, vh1),
      env.INGEST.prepare(`INSERT INTO ev_20261001 (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 120, 0, NULL, '/', ?, 1, NULL, NULL, 0)`).bind(sid, vh2),
      env.INGEST.prepare(`INSERT INTO ev_20261001 (sid, ts, k, name, path, vh, nv, goal_id, value_x100, src) VALUES (?, 130, 1, 'signup', '/', ?, 0, 7, 4990, 0)`).bind(sid, vh2),
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

    const summary = await call(`/api/v1/sites/${siteId}/summary?from=2026-10-01&to=2026-10-01`, {
      headers: { cookie },
    });
    expect(summary.status).toBe(200);
    const summaryBody = await summary.json() as { data: { pv: number; visitors: number; revenue: number } };
    expect(summaryBody.data.pv).toBe(3);
    expect(summaryBody.data.visitors).toBe(2);
    expect(summaryBody.data.revenue).toBe(49.9);
  });

  it('guards CSV formula injection', async () => {
    await env.CORE.prepare(
      "INSERT OR REPLACE INTO stats_daily (sid, day, dim, k, pv, visitors, events) VALUES (?, '2026-10-01', 'path', '=1+1', 1, 1, 0)"
    ).bind(sid).run();
    const response = await call(
      `/api/v1/sites/${siteId}/export?dataset=daily&format=csv&from=2026-10-01&to=2026-10-01`,
      { headers: { cookie } }
    );
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
        'user-agent': TEST_UA,
        'cf-connecting-ip': '203.0.113.8',
      },
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/hello' }),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();

    const day = getLocalDate(Math.floor(Date.now() / 1000), 'UTC');
    const suffix = suffixFromDay(day);
    await rollupHourlyPartition(env, suffix);
    const once = await env.CORE.prepare('SELECT COALESCE(SUM(pv), 0) AS pv FROM stats_hourly WHERE sid = ?')
      .bind(sid)
      .first<{ pv: number }>();
    await rollupHourlyPartition(env, suffix);
    const twice = await env.CORE.prepare('SELECT COALESCE(SUM(pv), 0) AS pv FROM stats_hourly WHERE sid = ?')
      .bind(sid)
      .first<{ pv: number }>();
    expect(twice?.pv).toBe(once?.pv);
    expect(once?.pv).toBeGreaterThan(0);
  });

  it('skips nightly export when backup secrets are unset', async () => {
    const result = await runNightly(env);
    expect(result.status).toBe('skipped');
  });
});
