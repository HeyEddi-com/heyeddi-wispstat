/**
 * Local email+password, plus optional Firebase ID tokens and Cloudflare Access JWTs.
 * External providers only match an operator who already exists (invite by email first).
 */

import type { Env, AuthContext } from '../lib/types';
import { sha256 } from '../lib/utils';
import { parseCookies, sessionCookieName } from './cookies';
import { verifyRs256Jwt } from './jwt';

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

async function userByEmail(env: Env, email: string | undefined): Promise<AuthContext | null> {
  if (!email) return null;
  const user = await env.CORE.prepare(
    'SELECT user_id, role FROM users WHERE lower(email) = lower(?)'
  ).bind(email).first<{ user_id: string; role: 'owner' | 'viewer' }>();
  if (!user) return null;
  return { userId: user.user_id, role: user.role, authTime: Math.floor(Date.now() / 1000) };
}

async function authenticateExternal(req: Request, env: Env): Promise<AuthContext | null> {
  const accessToken = req.headers.get('cf-access-jwt-assertion');
  if (accessToken && env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const claims = await verifyRs256Jwt(
      accessToken,
      `https://${team}/cdn-cgi/access/certs`,
      { aud: env.ACCESS_AUD }
    );
    const user = await userByEmail(env, claims?.email);
    if (user) return user;
  }

  const header = req.headers.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (bearer && env.FIREBASE_PROJECT_ID) {
    const project = env.FIREBASE_PROJECT_ID;
    const claims = await verifyRs256Jwt(
      bearer,
      'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
      { iss: `https://securetoken.google.com/${project}`, aud: project }
    );
    const user = await userByEmail(env, claims?.email);
    if (user) return user;
  }
  return null;
}

export async function authenticate(req: Request, env: Env): Promise<AuthContext | null> {
  return (await new LocalAuthProvider().authenticate(req, env)) || authenticateExternal(req, env);
}
