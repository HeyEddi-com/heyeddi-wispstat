/**
 * Session and read-key authorization for /api/v1.
 */

import type { Env, Site } from '../lib/types';
import { authenticate } from '../auth/providers';
import { BRANDING } from '../../branding.config';
import { errorResponse, isValidSiteId, sha256, timingSafeEqual } from '../lib/utils';

export interface UserPrincipal {
  kind: 'user';
  userId: string;
  role: 'owner' | 'viewer';
  authTime: number;
}

export interface KeyPrincipal {
  kind: 'key';
  sid: number;
  siteId: string;
  scopes: string[];
}

export type Principal = UserPrincipal | KeyPrincipal;

export function isResponse(value: Principal | Site | Response): value is Response {
  return value instanceof Response;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return null;
}

export function mapSite(row: Site): Site {
  return {
    ...row,
    honor_dnt: Boolean(row.honor_dnt),
    ingest_paused: Boolean(row.ingest_paused),
    digest_enabled: Boolean(row.digest_enabled),
    sessions_enabled: Boolean(row.sessions_enabled),
    upgrade_direct: Boolean(row.upgrade_direct),
    consent_mode: Boolean(row.consent_mode),
  };
}

export async function requirePrincipal(request: Request, env: Env): Promise<Principal | Response> {
  const presented = request.headers.get('x-ws-key');
  if (presented) {
    const key = await authenticateKey(request, env, presented);
    if (!key) return errorResponse('invalid_key', 'Invalid API key', 401);
    return key;
  }
  const user = await authenticate(request, env);
  if (!user) return errorResponse('unauthorized', 'Login required', 401);
  return { kind: 'user', userId: user.userId, role: user.role, authTime: user.authTime };
}

async function authenticateKey(request: Request, env: Env, presented: string): Promise<KeyPrincipal | null> {
  const match = presented.match(/^wsk_(s_[0-9a-hjkmnp-z]{16})_(.+)$/);
  if (!match || !isValidSiteId(match[1]!)) return null;
  const siteId = match[1]!;
  const secret = match[2]!;
  const site = await env.CORE.prepare('SELECT sid FROM sites WHERE site_id = ?').bind(siteId).first<{ sid: number }>();
  if (!site) return null;

  const rows = await env.CORE.prepare(
    "SELECT key_id, key_hash, scopes, allowed_origins FROM api_keys WHERE sid = ? AND kind = 'read' AND revoked_at IS NULL"
  ).bind(site.sid).all<{
    key_id: string;
    key_hash: unknown;
    scopes: string;
    allowed_origins: string;
  }>();

  const digest = await sha256(secret);
  const row = rows.results.find((candidate) => {
    const stored = toBytes(candidate.key_hash);
    return stored ? timingSafeEqual(digest, stored) : false;
  });
  if (!row) return null;

  // Empty allow-list = any origin (key is the secret). Non-empty = browser Origin must match.
  const origins = JSON.parse(row.allowed_origins || '[]') as string[];
  const origin = request.headers.get('origin');
  if (origins.length > 0 && origin && !origins.includes(origin)) return null;

  const today = new Date().toISOString().slice(0, 10);
  await env.CORE.prepare(
    'UPDATE api_keys SET last_used_day = ? WHERE key_id = ? AND (last_used_day IS NULL OR last_used_day != ?)'
  ).bind(today, row.key_id, today).run();

  return {
    kind: 'key',
    sid: site.sid,
    siteId,
    scopes: JSON.parse(row.scopes || '[]') as string[],
  };
}

export function assertCsrf(request: Request, principal: Principal): Response | null {
  if (principal.kind !== 'user') return null;
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return null;
  if (request.headers.get('x-ws-csrf') !== '1') {
    return errorResponse('csrf', 'Missing X-WS-CSRF header', 403);
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return errorResponse('csrf', 'Origin mismatch', 403);
  }
  return null;
}

export function assertOwner(principal: Principal): Response | null {
  if (principal.kind !== 'user' || principal.role !== 'owner') {
    return errorResponse('forbidden', 'Owner required', 403);
  }
  return null;
}

export async function loadSite(env: Env, principal: Principal, siteRef: string): Promise<Site | Response> {
  const row = await env.CORE.prepare(
    'SELECT * FROM sites WHERE site_id = ? OR (slug IS NOT NULL AND slug = ?)'
  ).bind(siteRef, siteRef).first<Site>();
  if (!row) return errorResponse('not_found', 'Site not found', 404);
  const site = mapSite(row);
  if (principal.kind === 'key') {
    if (principal.sid !== site.sid) return errorResponse('forbidden', 'Key is for another site', 403);
    return site;
  }
  if (principal.role === 'owner') return site;
  const member = await env.CORE.prepare(
    'SELECT role FROM site_members WHERE sid = ? AND user_id = ?'
  ).bind(site.sid, principal.userId).first();
  if (!member) return errorResponse('forbidden', 'No access to this site', 403);
  return site;
}

export function cookieName(): string {
  return BRANDING.COOKIE_PREFIX + 'session';
}
