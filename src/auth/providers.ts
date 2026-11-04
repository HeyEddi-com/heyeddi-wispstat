/**
 * Local email+password auth (only provider).
 */

import type { Env, AuthContext } from '../lib/types';
import { BRANDING } from '../../branding.config';

export interface AuthProvider {
  id: string;
  authenticate(req: Request, env: Env): Promise<AuthContext | null>;
}

export class LocalAuthProvider implements AuthProvider {
  id = 'local';

  async authenticate(req: Request, env: Env): Promise<AuthContext | null> {
    const cookieName = BRANDING.COOKIE_PREFIX + 'session';
    const cookies = parseCookies(req.headers.get('cookie') || '');
    const token = cookies[cookieName];

    if (!token) return null;

    const tokenHash = await sha256(token);
    const session = await env.CORE.prepare(
      'SELECT user_id, auth_time FROM login_sessions WHERE token_hash = ? AND expires_at > ?'
    ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{
      user_id: string;
      auth_time: number;
    }>();

    if (!session) return null;

    const user = await env.CORE.prepare(
      'SELECT role FROM users WHERE user_id = ?'
    ).bind(session.user_id).first<{ role: 'owner' | 'viewer' }>();

    if (!user) return null;

    return {
      userId: session.user_id,
      authTime: session.auth_time,
      role: user.role,
    };
  }
}

async function sha256(data: string): Promise<Uint8Array> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(hash);
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookie of cookieHeader.split(';')) {
    const [key, ...rest] = cookie.split('=');
    if (key && rest.length > 0) {
      cookies[key.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}

export function getAuthProvider(id: string): AuthProvider {
  if (id === 'local') return new LocalAuthProvider();
  throw new Error(`Unknown auth provider: ${id}`);
}

export async function authenticate(req: Request, env: Env): Promise<AuthContext | null> {
  return new LocalAuthProvider().authenticate(req, env);
}
