/**
 * Local auth routes (claim, login, logout)
 */

import type { Env } from '../lib/types';
import { getConfig, CONSTANTS } from '../../wispstat.config';
import { generateToken, errorResponse, sha256 } from '../lib/utils';
import { clearSessionCookie, parseCookies, sessionCookieName, setSessionCookie } from './cookies';

const SESSION_TTL_SEC = 7 * 86400;

/**
 * POST /auth/claim
 * First-run claim with SETUP_TOKEN
 */
export async function handleClaim(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST required', 405);
  }

  const config = getConfig(env);

  const instance = await env.CORE.prepare(
    "SELECT v FROM instance WHERE k = 'claimed'"
  ).first<{ v: string }>();

  if (instance?.v === '1') {
    return errorResponse('already_claimed', 'Instance already claimed', 403);
  }

  const body = await request.json() as {
    setup_token: string;
    email: string;
    password: string;
  };

  if (body.setup_token !== config.setupToken) {
    return errorResponse('invalid_token', 'Invalid setup token', 403);
  }

  if (!body.email || !body.email.includes('@')) {
    return errorResponse('invalid_email', 'Valid email required', 400);
  }

  if (!body.password || body.password.length < 12) {
    return errorResponse('weak_password', 'Password must be at least 12 characters', 400);
  }

  const { hash, salt } = await hashPassword(body.password, config.pbkdf2Iterations);
  const pwHash = `pbkdf2:${config.pbkdf2Iterations}:${salt}:${hash}`;

  const now = Math.floor(Date.now() / 1000);

  try {
    await env.CORE.batch([
      env.CORE.prepare("UPDATE instance SET v = '1' WHERE k = 'claimed' AND v = '0'"),
      env.CORE.prepare(`
        INSERT INTO users (user_id, provider, email, pw_hash, role, created_at)
        VALUES ('local:1', 'local', ?, ?, 'owner', ?)
      `).bind(body.email, pwHash, now),
    ]);

    const token = generateToken(CONSTANTS.SESSION_TOKEN_BYTES);
    const tokenHash = await sha256(token);
    const expiresAt = now + SESSION_TTL_SEC;

    await env.CORE.prepare(`
      INSERT INTO login_sessions (token_hash, user_id, created_at, expires_at, auth_time)
      VALUES (?, 'local:1', ?, ?, ?)
    `).bind(tokenHash, now, expiresAt, now).run();

    return Response.json(
      { claimed: true, user_id: 'local:1' },
      {
        headers: {
          'Set-Cookie': setSessionCookie(token, SESSION_TTL_SEC),
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    console.error('Claim error:', error);
    return errorResponse('claim_failed', 'Failed to claim instance', 500);
  }
}

/**
 * POST /auth/login
 */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'POST required', 405);
  }

  const body = await request.json() as {
    email: string;
    password: string;
  };

  const user = await env.CORE.prepare(
    "SELECT user_id, pw_hash FROM users WHERE provider = 'local' AND email = ?"
  ).bind(body.email).first<{ user_id: string; pw_hash: string }>();

  if (!user || !user.pw_hash) {
    return errorResponse('invalid_credentials', 'Invalid email or password', 401);
  }

  const valid = await verifyPassword(body.password, user.pw_hash);
  if (!valid) {
    return errorResponse('invalid_credentials', 'Invalid email or password', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = generateToken(CONSTANTS.SESSION_TOKEN_BYTES);
  const tokenHash = await sha256(token);
  const expiresAt = now + SESSION_TTL_SEC;

  await env.CORE.prepare(`
    INSERT INTO login_sessions (token_hash, user_id, created_at, expires_at, auth_time)
    VALUES (?, ?, ?, ?, ?)
  `).bind(tokenHash, user.user_id, now, expiresAt, now).run();

  return Response.json(
    { user_id: user.user_id },
    {
      headers: {
        'Set-Cookie': setSessionCookie(token, SESSION_TTL_SEC),
        'Cache-Control': 'private, no-store',
      },
    }
  );
}

/**
 * POST /auth/logout
 * Revoke server session and clear the __Host- cookie (attributes must match set).
 */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const token = cookies[sessionCookieName()];

  if (token) {
    const tokenHash = await sha256(token);
    await env.CORE.prepare(
      'DELETE FROM login_sessions WHERE token_hash = ?'
    ).bind(tokenHash).run();
  }

  return Response.json(
    { logged_out: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookie(),
        'Cache-Control': 'private, no-store',
      },
    }
  );
}

async function hashPassword(password: string, iterations: number): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = btoa(String.fromCharCode(...saltBytes));

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  const hashBytes = new Uint8Array(derived);
  const hash = btoa(String.fromCharCode(...hashBytes));

  return { hash, salt };
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = parseInt(parts[1]!);
  const salt = parts[2]!;
  const expectedHash = parts[3]!;

  const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );

  const hashBytes = new Uint8Array(derived);
  const hash = btoa(String.fromCharCode(...hashBytes));

  return hash === expectedHash;
}
