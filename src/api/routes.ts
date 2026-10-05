/**
 * /api/v1 read and admin routes.
 */

import type { Hono } from 'hono';
import type { Env, Site } from '../lib/types';
import { getConfig } from '../../wispstat.config';
import {
  errorResponse,
  generateSiteId,
  generateToken,
  sha256,
} from '../lib/utils';
import {
  assertCsrf,
  assertOwner,
  isResponse,
  loadSite,
  mapSite,
  requirePrincipal,
  type Principal,
} from './access';
import {
  breakdown,
  budget,
  envelope,
  exportRows,
  live,
  overview,
  resolveRange,
  siteSummary,
  sources,
  timeseries,
  toCsv,
  type Range,
} from './queries';

type App = Hono<{ Bindings: Env }>;

function json(request: Request, principal: Principal, body: unknown, status = 200, ttl?: number): Response {
  const headers: Record<string, string> = { Vary: 'Origin' };
  const origin = request.headers.get('origin');
  if (origin && (principal.kind === 'key' || origin === new URL(request.url).origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  if (ttl) headers['Cache-Control'] = `private, max-age=${ttl}`;
  return Response.json(body, { status, headers });
}

async function open(request: Request, env: Env): Promise<{ principal: Principal } | Response> {
  const principal = await requirePrincipal(request, env);
  if (isResponse(principal)) return principal;
  const csrf = assertCsrf(request, principal);
  if (csrf) return csrf;
  return { principal };
}

async function openSite(request: Request, env: Env, siteRef: string): Promise<{ principal: Principal; site: Site } | Response> {
  const opened = await open(request, env);
  if (opened instanceof Response) return opened;
  const site = await loadSite(env, opened.principal, siteRef);
  if (isResponse(site)) return site;
  return { principal: opened.principal, site };
}

function rangeFor(request: Request, site: Site): Range | Response {
  return resolveRange(new URL(request.url), site.tz);
}

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function registerApi(app: App): void {
  app.options('/api/v1/*', (c) => {
    const origin = c.req.header('origin') || '';
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, X-WS-Key, X-WS-CSRF, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  });

  app.get('/api/v1/budget', async (c) => {
    const opened = await open(c.req.raw, c.env);
    if (opened instanceof Response) return opened;
    return json(c.req.raw, opened.principal, await budget(c.env), 200, 60);
  });

  app.get('/api/v1/sites', async (c) => {
    const opened = await open(c.req.raw, c.env);
    if (opened instanceof Response) return opened;
    if (opened.principal.kind === 'key') {
      return errorResponse('forbidden', 'API keys cannot list sites', 403);
    }
    const rows = opened.principal.role === 'owner'
      ? await c.env.CORE.prepare('SELECT * FROM sites ORDER BY name').all<Site>()
      : await c.env.CORE.prepare(`
          SELECT s.* FROM sites s
          JOIN site_members m ON m.sid = s.sid
          WHERE m.user_id = ? ORDER BY s.name
        `).bind(opened.principal.userId).all<Site>();
    const sites = rows.results.map(mapSite);
    return json(c.req.raw, opened.principal, {
      data: sites.map((site) => ({
        site_id: site.site_id,
        slug: site.slug,
        name: site.name,
        tz: site.tz,
        currency: site.currency,
        domains: JSON.parse(site.domains || '[]'),
        honor_dnt: site.honor_dnt,
        ingest_paused: site.ingest_paused,
        digest_enabled: site.digest_enabled,
      })),
    });
  });

  app.get('/api/v1/overview', async (c) => {
    const opened = await open(c.req.raw, c.env);
    if (opened instanceof Response) return opened;
    if (opened.principal.kind === 'key') return errorResponse('forbidden', 'API keys are site-scoped', 403);
    const rows = opened.principal.role === 'owner'
      ? await c.env.CORE.prepare('SELECT * FROM sites ORDER BY name').all<Site>()
      : await c.env.CORE.prepare(`
          SELECT s.* FROM sites s JOIN site_members m ON m.sid = s.sid WHERE m.user_id = ?
        `).bind(opened.principal.userId).all<Site>();
    const sites = rows.results.map(mapSite);
    const tz = sites[0]?.tz || getConfig(c.env).defaultTz;
    const range = resolveRange(new URL(c.req.url), tz);
    if (range instanceof Response) return range;
    return json(c.req.raw, opened.principal, {
      from: range.from,
      to: range.to,
      generated_at: Math.floor(Date.now() / 1000),
      data: await overview(c.env, sites, range),
    }, 200, 60);
  });

  app.post('/api/v1/sites', async (c) => {
    const opened = await open(c.req.raw, c.env);
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ name?: string; slug?: string; domains?: string[]; tz?: string; currency?: string }>();
    if (!body.name || body.name.length > 80) return errorResponse('invalid_name', 'Name is required', 400);
    const domains = (body.domains || []).map((domain) => domain.trim().toLowerCase()).filter(Boolean);
    if (domains.length === 0) return errorResponse('invalid_domains', 'At least one domain is required', 400);
    if (body.slug && !/^[a-z0-9-]{2,40}$/.test(body.slug)) return errorResponse('invalid_slug', 'Invalid slug', 400);
    const tz = body.tz || getConfig(c.env).defaultTz;
    if (!validTz(tz)) return errorResponse('invalid_tz', 'Unknown timezone', 400);
    const currency = (body.currency || 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return errorResponse('invalid_currency', 'Currency must be a 3-letter code', 400);
    const siteId = generateSiteId();
    const now = Math.floor(Date.now() / 1000);
    await c.env.CORE.prepare(`
      INSERT INTO sites (site_id, slug, name, domains, tz, currency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(siteId, body.slug || null, body.name, JSON.stringify(domains), tz, currency, now).run();
    const origin = new URL(c.req.url).origin;
    return json(c.req.raw, opened.principal, {
      site_id: siteId,
      snippet: `<script defer src="${origin}/ws.js" data-site="${siteId}"></script>`,
    }, 201);
  });

  app.patch('/api/v1/sites/:site', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<Record<string, unknown>>();
    const site = opened.site;
    const name = typeof body.name === 'string' ? body.name : site.name;
    const slug = body.slug === null ? null : typeof body.slug === 'string' ? body.slug : site.slug;
    if (slug && !/^[a-z0-9-]{2,40}$/.test(slug)) return errorResponse('invalid_slug', 'Invalid slug', 400);
    const tz = typeof body.tz === 'string' ? body.tz : site.tz;
    if (!validTz(tz)) return errorResponse('invalid_tz', 'Unknown timezone', 400);
    const currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : site.currency;
    if (!/^[A-Z]{3}$/.test(currency)) return errorResponse('invalid_currency', 'Invalid currency', 400);
    const domains = Array.isArray(body.domains)
      ? (body.domains as string[]).map((domain) => domain.trim().toLowerCase()).filter(Boolean)
      : JSON.parse(site.domains || '[]');
    if (domains.length === 0) return errorResponse('invalid_domains', 'At least one domain is required', 400);
    const flag = (key: 'honor_dnt' | 'ingest_paused' | 'digest_enabled', current: boolean) =>
      typeof body[key] === 'boolean' ? (body[key] ? 1 : 0) : (current ? 1 : 0);
    await c.env.CORE.prepare(`
      UPDATE sites SET name = ?, slug = ?, domains = ?, tz = ?, currency = ?,
        honor_dnt = ?, ingest_paused = ?, digest_enabled = ?
      WHERE sid = ?
    `).bind(
      name, slug, JSON.stringify(domains), tz, currency,
      flag('honor_dnt', site.honor_dnt),
      flag('ingest_paused', site.ingest_paused),
      flag('digest_enabled', site.digest_enabled),
      site.sid
    ).run();
    return json(c.req.raw, opened.principal, { updated: true });
  });

  app.get('/api/v1/sites/:site/summary', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const range = rangeFor(c.req.raw, opened.site);
    if (range instanceof Response) return range;
    const data = await siteSummary(c.env, opened.site, range);
    return json(c.req.raw, opened.principal, envelope(opened.site, range, data, null, 60), 200, 60);
  });

  app.get('/api/v1/sites/:site/timeseries', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const range = rangeFor(c.req.raw, opened.site);
    if (range instanceof Response) return range;
    const url = new URL(c.req.url);
    const data = await timeseries(
      c.env,
      opened.site,
      range,
      url.searchParams.get('metric') || 'pv',
      url.searchParams.get('grain') || 'day'
    );
    if (data instanceof Response) return data;
    return json(c.req.raw, opened.principal, envelope(opened.site, range, data, url.searchParams.get('grain') || 'day', 60), 200, 60);
  });

  app.get('/api/v1/sites/:site/breakdown', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const range = rangeFor(c.req.raw, opened.site);
    if (range instanceof Response) return range;
    const url = new URL(c.req.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '20')));
    const data = await breakdown(c.env, opened.site, range, url.searchParams.get('dim') || 'path', limit);
    if (data instanceof Response) return data;
    return json(c.req.raw, opened.principal, envelope(opened.site, range, data, null, 60), 200, 60);
  });

  app.get('/api/v1/sites/:site/sources', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const range = rangeFor(c.req.raw, opened.site);
    if (range instanceof Response) return range;
    const url = new URL(c.req.url);
    const goal = url.searchParams.get('goal');
    const data = await sources(c.env, opened.site, range, url.searchParams.get('level') || 'channel', goal ? Number(goal) : null);
    if (data instanceof Response) return data;
    return json(c.req.raw, opened.principal, envelope(opened.site, range, data, null, 60), 200, 60);
  });

  app.get('/api/v1/sites/:site/goals', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const rows = await c.env.CORE.prepare(
      'SELECT goal_id, name, kind, match_type, pattern, active, created_at FROM goals WHERE sid = ? ORDER BY name'
    ).bind(opened.site.sid).all();
    return json(c.req.raw, opened.principal, { data: rows.results });
  });

  app.post('/api/v1/sites/:site/goals', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ name?: string; kind?: string; match_type?: string; pattern?: string }>();
    if (!body.name || !body.pattern) return errorResponse('invalid_goal', 'Name and pattern are required', 400);
    if (body.kind !== 'event' && body.kind !== 'path') return errorResponse('invalid_goal', 'Kind must be event or path', 400);
    if (body.match_type !== 'exact' && body.match_type !== 'prefix') return errorResponse('invalid_goal', 'Match must be exact or prefix', 400);
    const now = Math.floor(Date.now() / 1000);
    const result = await c.env.CORE.prepare(`
      INSERT INTO goals (sid, name, kind, match_type, pattern, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(opened.site.sid, body.name, body.kind, body.match_type, body.pattern, now).run();
    return json(c.req.raw, opened.principal, { goal_id: result.meta.last_row_id }, 201);
  });

  app.patch('/api/v1/sites/:site/goals/:id', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ name?: string; active?: boolean; pattern?: string }>();
    await c.env.CORE.prepare(`
      UPDATE goals SET
        name = COALESCE(?, name),
        pattern = COALESCE(?, pattern),
        active = COALESCE(?, active)
      WHERE goal_id = ? AND sid = ?
    `).bind(
      body.name ?? null,
      body.pattern ?? null,
      typeof body.active === 'boolean' ? (body.active ? 1 : 0) : null,
      Number(c.req.param('id')),
      opened.site.sid
    ).run();
    return json(c.req.raw, opened.principal, { updated: true });
  });

  app.delete('/api/v1/sites/:site/goals/:id', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    await c.env.CORE.prepare('DELETE FROM goals WHERE goal_id = ? AND sid = ?')
      .bind(Number(c.req.param('id')), opened.site.sid).run();
    return json(c.req.raw, opened.principal, { deleted: true });
  });

  app.get('/api/v1/sites/:site/goals/:id/conversions', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const range = rangeFor(c.req.raw, opened.site);
    if (range instanceof Response) return range;
    const level = new URL(c.req.url).searchParams.get('by') || 'channel';
    const data = await sources(c.env, opened.site, range, level === 'campaign' ? 'campaign' : level === 'source' ? 'source' : 'channel', Number(c.req.param('id')));
    if (data instanceof Response) return data;
    return json(c.req.raw, opened.principal, envelope(opened.site, range, data, null, 60), 200, 60);
  });

  app.get('/api/v1/sites/:site/live', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    if (opened.principal.kind === 'key') return errorResponse('forbidden', 'Live view requires a user session', 403);
    const data = await live(c.env, opened.site);
    const today = new Date().toISOString().slice(0, 10);
    return json(c.req.raw, opened.principal, envelope(opened.site, { from: today, to: today }, data, null, 15), 200, 15);
  });

  app.get('/api/v1/sites/:site/export', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    if (opened.principal.kind !== 'user') return errorResponse('forbidden', 'Export requires a user session', 403);
    const range = rangeFor(c.req.raw, opened.site);
    if (range instanceof Response) return range;
    const url = new URL(c.req.url);
    const rows = await exportRows(c.env, opened.site, range, url.searchParams.get('dataset') || 'daily');
    if (rows instanceof Response) return rows;
    const format = url.searchParams.get('format') || 'json';
    if (format === 'csv') {
      return new Response(toCsv(rows as Array<Record<string, unknown>>), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="wispstat.csv"',
          'cache-control': 'private, no-store',
        },
      });
    }
    if (format !== 'json') return errorResponse('invalid_format', 'format must be csv or json', 400);
    return json(c.req.raw, opened.principal, envelope(opened.site, range, rows, null, 0));
  });

  app.post('/api/v1/sites/:site/api-keys', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ label?: string; kind?: string; allowed_origins?: string[] }>();
    const kind = body.kind === 'server' ? 'server' : 'read';
    const secret = generateToken(32);
    const prefix = kind === 'server' ? 'wss' : 'wsk';
    const token = `${prefix}_${opened.site.site_id}_${secret}`;
    const keyId = generateToken(9);
    const now = Math.floor(Date.now() / 1000);
    await c.env.CORE.prepare(`
      INSERT INTO api_keys (key_id, sid, kind, label, key_hash, scopes, allowed_origins, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      keyId,
      opened.site.sid,
      kind,
      body.label || null,
      await sha256(secret),
      JSON.stringify(kind === 'read' ? ['read'] : ['server']),
      JSON.stringify(body.allowed_origins || []),
      now
    ).run();
    return json(c.req.raw, opened.principal, { key_id: keyId, key: token }, 201);
  });

  app.get('/api/v1/sites/:site/api-keys', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const rows = await c.env.CORE.prepare(
      'SELECT key_id, kind, label, created_at, last_used_day, revoked_at FROM api_keys WHERE sid = ? ORDER BY created_at DESC'
    ).bind(opened.site.sid).all();
    return json(c.req.raw, opened.principal, { data: rows.results });
  });

  app.delete('/api/v1/sites/:site/api-keys/:id', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    await c.env.CORE.prepare(
      'UPDATE api_keys SET revoked_at = ? WHERE key_id = ? AND sid = ?'
    ).bind(Math.floor(Date.now() / 1000), c.req.param('id'), opened.site.sid).run();
    return json(c.req.raw, opened.principal, { revoked: true });
  });

  app.put('/api/v1/sites/:site/members', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ email?: string; role?: string; remove?: boolean }>();
    if (body.role !== 'owner' && body.role !== 'viewer') return errorResponse('invalid_role', 'Role must be owner or viewer', 400);
    const user = await c.env.CORE.prepare('SELECT user_id FROM users WHERE email = ?').bind(body.email || '').first<{ user_id: string }>();
    if (!user) return errorResponse('not_found', 'No user with that email', 404);
    if (body.remove) {
      await c.env.CORE.prepare('DELETE FROM site_members WHERE sid = ? AND user_id = ?').bind(opened.site.sid, user.user_id).run();
      return json(c.req.raw, opened.principal, { removed: true });
    }
    await c.env.CORE.prepare(`
      INSERT INTO site_members (sid, user_id, role) VALUES (?, ?, ?)
      ON CONFLICT(sid, user_id) DO UPDATE SET role = excluded.role
    `).bind(opened.site.sid, user.user_id, body.role).run();
    return json(c.req.raw, opened.principal, { user_id: user.user_id, role: body.role });
  });

  app.get('/api/v1/sites/:site/utm-links', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const rows = await c.env.CORE.prepare(
      'SELECT id, label, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, full_url, created_at FROM utm_links WHERE sid = ? ORDER BY created_at DESC'
    ).bind(opened.site.sid).all();
    return json(c.req.raw, opened.principal, { data: rows.results });
  });

  app.post('/api/v1/sites/:site/utm-links', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ label?: string; base_url?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string }>();
    if (!body.base_url) return errorResponse('invalid_url', 'Base URL is required', 400);
    const host = hostOf(body.base_url);
    const domains = JSON.parse(opened.site.domains || '[]') as string[];
    if (!host || !domains.some((domain) => host === domain || host === `www.${domain}`)) {
      return errorResponse('invalid_url', 'Base URL must use one of the site domains', 400);
    }
    const url = new URL(body.base_url);
    const fields = [
      ['utm_source', body.utm_source],
      ['utm_medium', body.utm_medium],
      ['utm_campaign', body.utm_campaign],
      ['utm_content', body.utm_content],
      ['utm_term', body.utm_term],
    ] as const;
    for (const [key, value] of fields) {
      if (value) url.searchParams.set(key, value.toLowerCase());
    }
    const now = Math.floor(Date.now() / 1000);
    const result = await c.env.CORE.prepare(`
      INSERT INTO utm_links (sid, label, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, full_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      opened.site.sid, body.label || null, body.base_url,
      body.utm_source || null, body.utm_medium || null, body.utm_campaign || null,
      body.utm_content || null, body.utm_term || null, url.toString(), now
    ).run();
    return json(c.req.raw, opened.principal, { id: result.meta.last_row_id, full_url: url.toString() }, 201);
  });

  app.delete('/api/v1/sites/:site/utm-links/:id', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    await c.env.CORE.prepare('DELETE FROM utm_links WHERE id = ? AND sid = ?')
      .bind(Number(c.req.param('id')), opened.site.sid).run();
    return json(c.req.raw, opened.principal, { deleted: true });
  });

  app.patch('/api/v1/sites/:site/digest', async (c) => {
    const opened = await openSite(c.req.raw, c.env, c.req.param('site'));
    if (opened instanceof Response) return opened;
    const denied = assertOwner(opened.principal);
    if (denied) return denied;
    const body = await c.req.json<{ enabled?: boolean }>();
    await c.env.CORE.prepare('UPDATE sites SET digest_enabled = ? WHERE sid = ?')
      .bind(body.enabled ? 1 : 0, opened.site.sid).run();
    return json(c.req.raw, opened.principal, { digest_enabled: !!body.enabled });
  });
}
