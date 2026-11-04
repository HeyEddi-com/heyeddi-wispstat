/**
 * Local email+password auth (only provider).
 */

import type { Env, AuthContext } from '../lib/types';
import { sha256 } from '../lib/utils';
import { parseCookies, sessionCookieName } from './cookies';

export interface AuthProvider {
  id: string;
  authenticate(req: Request, env: Env): Promise<AuthContext | null>;
}

export class LocalAuthProvider implements AuthProvider {
  id = 'local';

  async authenticate(req: Request, env: Env): Promise<AuthContext | null> {
    const cookies = parseCookies(req.headers.get('cookie') || '');
    const token = cookies[sessionCookieName()];

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

export function getAuthProvider(id: string): AuthProvider {
  if (id === 'local') return new LocalAuthProvider();
  throw new Error(`Unknown auth provider: ${id}`);
}

export async function authenticate(req: Request, env: Env): Promise<AuthContext | null> {
  return new LocalAuthProvider().authenticate(req, env);
}
