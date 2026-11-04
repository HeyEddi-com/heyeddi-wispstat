import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { mintVisitToken, openVisitToken } from '../src/lib/visit-token';
import { mapProps } from '../src/lib/props';
import { applySchema } from './schema';
import { generateToken, sha256 } from '../src/lib/utils';
import { call, ensureOwnerSession, ensureSite } from './helpers';

describe('v1.2–v1.4', () => {
  let cookie = '';
  let siteId = '';
  let sid = 0;

  beforeAll(async () => {
    await applySchema();
    cookie = await ensureOwnerSession();
    const site = await ensureSite(cookie, { name: 'Full', domain: 'example.com' });
    siteId = site.siteId;
    sid = site.sid;
  });

  it('mints and opens a visit token', async () => {
    const token = await mintVisitToken(env, {
      sid,
      day: '2026-11-02',
      vh: 'ab'.repeat(32),
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(token).toBeTruthy();
    const claims = await openVisitToken(env, token!);
    expect(claims?.sid).toBe(sid);
    expect(claims?.vh).toBe('ab'.repeat(32));
  });

  it('maps capped properties', () => {
    const mapped = mapProps(
      [{ slot: 1, key: 'role', allowed: ['founder', 'developer'] }],
      { role: 'Founder', noise: 'x' }
    );
    expect(mapped.p1).toBe('founder');
    expect(mapped.p2).toBeNull();
  });

  it('accepts S2S events with server key and idempotency', async () => {
    const secret = generateToken(16);
    const token = `wss_${siteId}_${secret}`;
    await env.CORE.prepare(`
      INSERT INTO api_keys (key_id, sid, kind, label, key_hash, scopes, allowed_origins, created_at)
      VALUES (?, ?, 'server', 'test', ?, '["server"]', '[]', ?)
    `).bind('k_server', sid, await sha256(secret), Math.floor(Date.now() / 1000)).run();

    const first = await call('/api/v1/server/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event: 'purchase',
        value: 12.5,
        idempotency_key: 'evt_1',
      }),
    });
    expect(first.status).toBe(202);
    const body = await first.json() as { accepted: boolean; attributed: boolean };
    expect(body.accepted).toBe(true);
    expect(body.attributed).toBe(false);

    const second = await call('/api/v1/server/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event: 'purchase',
        value: 12.5,
        idempotency_key: 'evt_1',
      }),
    });
    const deduped = await second.json() as { deduped: boolean };
    expect(deduped.deduped).toBe(true);
  });

  it('saves prop defs', async () => {
    const response = await call(`/api/v1/sites/${siteId}/props`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-ws-csrf': '1',
      },
      body: JSON.stringify({
        defs: [{ key: 'role', allowed: ['founder', 'developer', 'other'] }],
      }),
    });
    expect(response.status).toBe(200);
    const listed = await call(`/api/v1/sites/${siteId}/props`, {
      headers: { cookie, 'x-ws-csrf': '1' },
    });
    const data = await listed.json() as { data: Array<{ key: string }> };
    expect(data.data[0]?.key).toBe('role');
  });
});
