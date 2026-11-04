import { env } from 'cloudflare:test';
import worker from '../src/index';

export const OWNER_EMAIL = 'owner@example.com';
export const OWNER_PASSWORD = 'correct-horse';

export const testCtx = {
  waitUntil(promise: Promise<unknown>) {
    return promise;
  },
  passThroughOnException() {
    return undefined;
  },
} as unknown as ExecutionContext;

export const TEST_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export function cookieFrom(response: Response): string {
  return (response.headers.get('set-cookie') || '').split(';')[0] || '';
}

export async function call(
  path: string,
  init: RequestInit = {},
  origin = 'https://example.com'
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('origin')) headers.set('origin', origin);
  return worker.fetch(new Request(`${origin}${path}`, { ...init, headers }), env, testCtx);
}

/**
 * Shared-D1 safe bootstrap: one owner across the whole suite.
 * Claim once; afterward always login as that owner.
 */
export async function ensureOwnerSession(): Promise<string> {
  const claim = await call('/auth/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      setup_token: 'a'.repeat(32),
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    }),
  });
  if (claim.status === 200) return cookieFrom(claim);

  const login = await call('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });
  if (login.status === 200) return cookieFrom(login);

  throw new Error(`Could not obtain owner session (claim=${claim.status} login=${login.status})`);
}

export async function ensureSite(
  cookie: string,
  opts: { name: string; domain: string }
): Promise<{ siteId: string; sid: number; snippet?: string }> {
  const created = await call('/api/v1/sites', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
      'x-ws-csrf': '1',
    },
    body: JSON.stringify({ name: opts.name, domain: opts.domain, tz: 'UTC', currency: 'USD' }),
  });
  if (created.status === 201) {
    const body = await created.json() as { site_id: string; snippet: string };
    const row = await env.CORE.prepare('SELECT sid FROM sites WHERE site_id = ?')
      .bind(body.site_id)
      .first<{ sid: number }>();
    return { siteId: body.site_id, sid: row!.sid, snippet: body.snippet };
  }

  const listed = await call('/api/v1/sites', { headers: { cookie } });
  const body = await listed.json() as { data: Array<{ site_id: string; domains: string[] }> };
  let match = body.data.find((site) => (site.domains || []).includes(opts.domain));
  if (!match) match = body.data[0];
  if (!match) throw new Error(`No site available after create status ${created.status}`);

  const row = await env.CORE.prepare('SELECT sid FROM sites WHERE site_id = ?')
    .bind(match.site_id)
    .first<{ sid: number }>();
  await env.CORE.prepare('UPDATE sites SET domains = ?, name = ? WHERE sid = ?')
    .bind(JSON.stringify([opts.domain]), opts.name, row!.sid)
    .run();
  return { siteId: match.site_id, sid: row!.sid };
}
