import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { closeDay } from '../src/cron/rollup';
import { ensurePartition, partitionTables, suffixFromDay } from '../src/lib/partitions';
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

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`http://example.test${path}`, init), env, ctx);
}

describe('v1.1 sessions and attribution', () => {
  beforeAll(async () => {
    await applySchema();
  });

  it('splits a day into sessions after a 30 minute gap', async () => {
    const day = '2026-10-04';
    const siteId = 's_v11sessn00000001';
    await env.CORE.prepare(`
      INSERT OR IGNORE INTO sites (site_id, name, domains, tz, currency, sessions_enabled, created_at)
      VALUES (?, 'Sessions', '["example.com"]', 'UTC', 'USD', 1, 1)
    `).bind(siteId).run();
    await env.CORE.prepare('UPDATE sites SET sessions_enabled = 1 WHERE site_id = ?').bind(siteId).run();
    const site = await env.CORE.prepare(
      'SELECT sid, site_id, tz, name, digest_enabled, sessions_enabled FROM sites WHERE site_id = ?'
    ).bind(siteId).first<{ sid: number; site_id: string; tz: string; name: string; digest_enabled: number; sessions_enabled: number }>();
    expect(site).toBeTruthy();

    const suffix = suffixFromDay(day);
    await ensurePartition(env.INGEST, suffix);
    const { ev, vis } = partitionTables(suffix);
    const vhA = new Uint8Array(16).fill(1);
    const vhB = new Uint8Array(16).fill(2);

    await env.INGEST.batch([
      env.INGEST.prepare(`INSERT INTO ${vis} (sid, vh, first_ts, channel, entry_path, country) VALUES (?, ?, 1000, 'Direct', '/', 'US')`).bind(site!.sid, vhA),
      env.INGEST.prepare(`INSERT INTO ${vis} (sid, vh, first_ts, channel, entry_path, country) VALUES (?, ?, 1000, 'Organic Search', '/blog', 'DE')`).bind(site!.sid, vhB),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, path, vh) VALUES (?, 1000, 0, '/', ?)`).bind(site!.sid, vhA),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, path, vh) VALUES (?, 1100, 0, '/next', ?)`).bind(site!.sid, vhA),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, path, vh) VALUES (?, 4000, 0, '/later', ?)`).bind(site!.sid, vhA),
      env.INGEST.prepare(`INSERT INTO ${ev} (sid, ts, k, path, vh) VALUES (?, 1500, 0, '/blog', ?)`).bind(site!.sid, vhB),
    ]);

    await closeDay(env, site!, day);

    const total = await env.CORE.prepare(
      "SELECT sessions, pv, bounces, dur_s_sum, dur_n FROM sessions_daily WHERE sid = ? AND day = ? AND dim = 'total'"
    ).bind(site!.sid, day).first<{ sessions: number; pv: number; bounces: number; dur_s_sum: number; dur_n: number }>();
    expect(total).toEqual({ sessions: 3, pv: 4, bounces: 2, dur_s_sum: 100, dur_n: 1 });

    const channel = await env.CORE.prepare(
      "SELECT sessions FROM sessions_daily WHERE sid = ? AND day = ? AND dim = 'channel' AND k = 'Direct'"
    ).bind(site!.sid, day).first<{ sessions: number }>();
    expect(channel?.sessions).toBe(2);

    const entry = await env.CORE.prepare(
      "SELECT k FROM sessions_daily WHERE sid = ? AND day = ? AND dim = 'path-entry' ORDER BY k"
    ).bind(site!.sid, day).all<{ k: string }>();
    expect(entry.results.map((row) => row.k)).toEqual(['/', '/blog']);
  });

  it('returns the caller first touch and does not write', async () => {
    const siteId = 's_v11attrb00000001';
    await env.CORE.prepare(`
      INSERT OR IGNORE INTO sites (site_id, name, domains, tz, currency, created_at)
      VALUES (?, 'Attrib', '["example.com"]', 'UTC', 'USD', 1)
    `).bind(siteId).run();

    const headers = {
      'content-type': 'text/plain',
      origin: 'https://example.com',
      'user-agent': UA,
      'cf-connecting-ip': '203.0.113.40',
    };
    const beacon = await call('/e', {
      method: 'POST',
      headers,
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/', us: 'newsletter', um: 'email' }),
    });
    expect(beacon.status).toBe(204);

    const day = getLocalDate(Math.floor(Date.now() / 1000), 'UTC');
    const { vis } = partitionTables(suffixFromDay(day));
    const before = await env.INGEST.prepare(`SELECT COUNT(*) AS n FROM ${vis}`).first<{ n: number }>();

    const response = await call('/a', {
      method: 'POST',
      headers,
      body: JSON.stringify({ s: siteId, p: '/' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.channel).toBe('Email');
    expect(body.source).toBe('newsletter');
    expect(body.date).toBe(day);
    expect(body).not.toHaveProperty('vh');
    expect(JSON.stringify(body)).not.toContain('203.0.113.40');

    const after = await env.INGEST.prepare(`SELECT COUNT(*) AS n FROM ${vis}`).first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it('upgrades a Direct first touch when a later visit has a source', async () => {
    const siteId = 's_v11upgrd00000001';
    await env.CORE.prepare(`
      INSERT OR IGNORE INTO sites (site_id, name, domains, tz, currency, upgrade_direct, created_at)
      VALUES (?, 'Upgrade', '["example.com"]', 'UTC', 'USD', 1, 1)
    `).bind(siteId).run();

    const headers = {
      'content-type': 'text/plain',
      origin: 'https://example.com',
      'user-agent': UA,
      'cf-connecting-ip': '203.0.113.41',
    };
    const first = await call('/e', {
      method: 'POST',
      headers,
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/' }),
    });
    expect(first.status).toBe(204);

    const second = await call('/e', {
      method: 'POST',
      headers: { ...headers, referer: 'https://news.ycombinator.com/item?id=1' },
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/story', r: 'https://news.ycombinator.com/item?id=1' }),
    });
    expect(second.status).toBe(204);

    const day = getLocalDate(Math.floor(Date.now() / 1000), 'UTC');
    const { vis } = partitionTables(suffixFromDay(day));
    const sid = await env.CORE.prepare('SELECT sid FROM sites WHERE site_id = ?').bind(siteId).first<{ sid: number }>();
    const row = await env.INGEST.prepare(
      `SELECT channel, ref_host FROM ${vis} WHERE sid = ?`
    ).bind(sid!.sid).first<{ channel: string; ref_host: string }>();
    expect(row).toEqual({ channel: 'Hacker News', ref_host: 'news.ycombinator.com' });
  });
});
