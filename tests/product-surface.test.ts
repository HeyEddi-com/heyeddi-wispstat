/**
 * End-to-end coverage for domains, heatmaps, visits, read keys, local-only config.
 */

import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { ensurePartition, suffixFromDay } from '../src/lib/partitions';
import { generateToken, getLocalDate, sha256 } from '../src/lib/utils';
import trackerSource from '../tracker/ws.ts?raw';
import { applySchema } from './schema';
import { TEST_UA, call, ensureOwnerSession, ensureSite } from './helpers';

describe('product surface', () => {
  let cookie = '';
  let siteId = '';
  let sid = 0;
  let readKey = '';
  const day = getLocalDate(Math.floor(Date.now() / 1000), 'UTC');
  const domain = 'heyeddi-test.com';

  beforeAll(async () => {
    await applySchema();
    cookie = await ensureOwnerSession();
    const site = await ensureSite(cookie, { name: 'Surface', domain });
    siteId = site.siteId;
    sid = site.sid;
    await ensurePartition(env.INGEST, suffixFromDay(day));

    const secret = generateToken(16);
    readKey = `wsk_${siteId}_${secret}`;
    await env.CORE.prepare(`
      INSERT OR IGNORE INTO api_keys (key_id, sid, kind, label, key_hash, scopes, allowed_origins, created_at)
      VALUES (?, ?, 'read', 'mcp', ?, '["read"]', '[]', ?)
    `).bind(`k_read_surface_${sid}`, sid, await sha256(secret), Math.floor(Date.now() / 1000)).run();

    // If ignore skipped insert, recreate key id uniquely
    const existing = await env.CORE.prepare(
      "SELECT key_id FROM api_keys WHERE sid = ? AND label = 'mcp' AND revoked_at IS NULL"
    ).bind(sid).first();
    if (!existing) {
      const secret2 = generateToken(16);
      readKey = `wsk_${siteId}_${secret2}`;
      await env.CORE.prepare(`
        INSERT INTO api_keys (key_id, sid, kind, label, key_hash, scopes, allowed_origins, created_at)
        VALUES (?, ?, 'read', 'mcp', ?, '["read"]', '[]', ?)
      `).bind(`k_read_${sid}_${Date.now()}`, sid, await sha256(secret2), Math.floor(Date.now() / 1000)).run();
    }
  });

  it('publishes local-only /config (no firebase)', async () => {
    const response = await call('/config');
    expect(response.status).toBe(200);
    const body = await response.json() as {
      claimed: boolean;
      auth_providers: string[];
      firebase_web_config?: unknown;
    };
    expect(body.auth_providers).toEqual(['local']);
    expect(body.firebase_web_config).toBeUndefined();
  });

  it('rejects multi-domain create payloads', async () => {
    const response = await call('/api/v1/sites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-ws-csrf': '1',
      },
      body: JSON.stringify({
        name: 'Bad',
        domains: ['a.com', 'b.com'],
        tz: 'UTC',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('accepts beacons from apex subdomains and drops foreign hosts', async () => {
    const ok = await call('/e', {
      method: 'POST',
      headers: {
        origin: `https://app.${domain}`,
        'content-type': 'text/plain',
        'user-agent': TEST_UA,
        'cf-connecting-ip': '203.0.113.10',
      },
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/home' }),
    }, `https://app.${domain}`);
    expect(ok.status).toBe(204);

    const foreign = await call('/e', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.net',
        'content-type': 'text/plain',
        'user-agent': TEST_UA,
        'cf-connecting-ip': '203.0.113.11',
      },
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/hack' }),
    }, 'https://evil.example.net');
    expect(foreign.status).toBe(204);

    const count = await env.INGEST.prepare(
      `SELECT COUNT(*) AS n FROM ev_${day.replace(/-/g, '')} WHERE sid = ? AND path = '/hack'`
    ).bind(sid).first<{ n: number }>();
    expect(count?.n || 0).toBe(0);
  });

  it('records heat/scroll/form autos and serves heatmap + visits APIs', async () => {
    const events = [
      { n: 'hm.2.3', p: '/pricing' },
      { n: 'hm.2.3', p: '/pricing' },
      { n: 'hm.5.5', p: '/pricing' },
      { n: 'scroll.50', p: '/pricing' },
      { n: 'form_submit', p: '/pricing' },
      { n: 'outbound:example.com', p: '/pricing' },
    ];
    for (const event of events) {
      const response = await call('/e', {
        method: 'POST',
        headers: {
          origin: `https://www.${domain}`,
          'content-type': 'text/plain',
          'user-agent': TEST_UA,
          'cf-connecting-ip': '203.0.113.20',
        },
        body: JSON.stringify({ s: siteId, k: 'ev', n: event.n, p: event.p }),
      }, `https://www.${domain}`);
      expect(response.status).toBe(204);
    }
    await call('/e', {
      method: 'POST',
      headers: {
        origin: `https://docs.${domain}`,
        'content-type': 'text/plain',
        'user-agent': TEST_UA,
        'cf-connecting-ip': '203.0.113.21',
      },
      body: JSON.stringify({ s: siteId, k: 'pv', p: '/docs' }),
    }, `https://docs.${domain}`);

    const heat = await call(`/api/v1/sites/${siteId}/heatmap?day=${day}&path=/pricing`, {
      headers: { cookie },
    });
    expect(heat.status).toBe(200);
    const heatBody = await heat.json() as {
      path: string;
      grid_size: number;
      cells: Array<{ gx: number; gy: number; clicks: number }>;
      scroll_depth: Array<{ depth: number; events: number }>;
    };
    expect(heatBody.grid_size).toBe(12);
    expect(heatBody.path).toBe('/pricing');
    const hot = heatBody.cells.find((c) => c.gx === 2 && c.gy === 3);
    expect(hot?.clicks).toBeGreaterThanOrEqual(2);
    expect(heatBody.scroll_depth.find((s) => s.depth === 50)?.events).toBeGreaterThanOrEqual(1);

    const visits = await call(`/api/v1/sites/${siteId}/visits?day=${day}&has_event=form_submit`, {
      headers: { cookie },
    });
    expect(visits.status).toBe(200);
    const visitBody = await visits.json() as {
      data: Array<{ vh: string; event_names: string[]; session_index: number }>;
    };
    expect(visitBody.data.length).toBeGreaterThanOrEqual(1);

    const vh = visitBody.data[0]!.vh;
    const timeline = await call(
      `/api/v1/sites/${siteId}/visits/${vh}?day=${day}&session=${visitBody.data[0]!.session_index}`,
      { headers: { cookie } }
    );
    expect(timeline.status).toBe(200);
    const tl = await timeline.json() as { timeline: Array<{ kind: string }> };
    expect(tl.timeline.length).toBeGreaterThan(0);
  });

  it('allows read API keys for live, heatmap, and visits (MCP path)', async () => {
    const headers = { 'x-ws-key': readKey };
    expect((await call(`/api/v1/sites/${siteId}/live`, { headers })).status).toBe(200);
    expect((await call(`/api/v1/sites/${siteId}/heatmap?day=${day}`, { headers })).status).toBe(200);
    expect((await call(`/api/v1/sites/${siteId}/visits?day=${day}`, { headers })).status).toBe(200);
    expect((await call('/api/v1/overview', { headers })).status).toBe(403);
  });

  it('tracker source stays privacy-clean for heat features', () => {
    const code = trackerSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code.includes('localStorage')).toBe(false);
    expect(code.includes('sessionStorage')).toBe(false);
    expect(code.includes('screen.')).toBe(false);
    expect(code.includes('hm.')).toBe(true);
    expect(code.includes('scroll.')).toBe(true);
  });
});
