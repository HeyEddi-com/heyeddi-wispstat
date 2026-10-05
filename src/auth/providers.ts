/**
 * Auth provider interface and implementations
 */

import type { Env, AuthContext } from '../lib/types';
import { getConfig } from '../../edgemetry.config';
import { BRANDING } from '../../branding.config';

export interface AuthProvider {
  id: string;
  authenticate(req: Request, env: Env): Promise<AuthContext | null>;
}

/**
 * Local email+password auth
 */
export class LocalAuthProvider implements AuthProvider {
  id = 'local';
  
  async authenticate(req: Request, env: Env): Promise<AuthContext | null> {
    const cookieName = BRANDING.COOKIE_PREFIX + 'session';
    const cookies = parseCookies(req.headers.get('cookie') || '');
    const token = cookies[cookieName];
    
    if (!token) return null;
    
    // Hash token and lookup session
    const tokenHash = await sha256(token);
    const session = await env.CORE.prepare(
      'SELECT user_id, auth_time FROM login_sessions WHERE token_hash = ? AND expires_at > ?'
    ).bind(tokenHash, Math.floor(Date.now() / 1000)).first<{
      user_id: string;
      auth_time: number;
    }>();
    
    if (!session) return null;
    
    // Get user
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

/**
 * Firebase Auth provider
 */
export class FirebaseAuthProvider implements AuthProvider {
  id = 'firebase';
  
  async authenticate(req: Request, env: Env): Promise<AuthContext | null> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    
    const token = authHeader.slice(7);
    const config = getConfig(env);
    
    if (!config.firebaseProjectId) {
      throw new Error('FIREBASE_PROJECT_ID not configured');
    }
    
    // Verify Firebase ID token
    const payload = await verifyFirebaseToken(token, config.firebaseProjectId);
    if (!payload) return null;
    
    const userId = `fb:${payload.sub}`;
    
    // Check if user exists
    const user = await env.CORE.prepare(
      'SELECT role FROM users WHERE user_id = ?'
    ).bind(userId).first<{ role: 'owner' | 'viewer' }>();
    
    if (!user) return null;
    
    return {
      userId,
      authTime: payload.auth_time,
      role: user.role,
    };
  }
}

interface FirebaseTokenPayload {
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  auth_time: number;
}

async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebaseTokenPayload | null> {
  try {
    // Decode JWT header to get kid
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const header = JSON.parse(atob(parts[0]!)) as { alg: string; kid: string };
    if (header.alg !== 'RS256') return null;
    
    // Fetch Google's public keys (cached)
    const keys = await getFirebasePublicKeys();
    const key = keys[header.kid];
    if (!key) return null;
    
    // Import key
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    // Verify signature
    const encoder = new TextEncoder();
    const data = encoder.encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToArrayBuffer(parts[2]!);
    
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signature,
      data
    );
    
    if (!valid) return null;
    
    // Decode and validate payload
    const payload = JSON.parse(atob(parts[1]!)) as FirebaseTokenPayload;
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.iat > now + 60) return null;
    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (!payload.sub) return null;
    
    return payload;
    
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return null;
  }
}

const keyCache = new Map<string, { keys: Record<string, JsonWebKey>; expires: number }>();

async function getFirebasePublicKeys(): Promise<Record<string, JsonWebKey>> {
  const cached = keyCache.get('firebase');
  if (cached && cached.expires > Date.now()) {
    return cached.keys;
  }
  
  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch Firebase public keys');
  }
  
  const certs = await response.json() as Record<string, string>;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]!) : 3600;
  
  const keys: Record<string, JsonWebKey> = {};
  for (const [kid, cert] of Object.entries(certs)) {
    keys[kid] = await pemToJwk(cert);
  }
  
  keyCache.set('firebase', { keys, expires: Date.now() + maxAge * 1000 });
  return keys;
}

async function pemToJwk(pem: string): Promise<JsonWebKey> {
  const pemContents = pem
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s/g, '');
  
  const binaryDer = atob(pemContents);
  const der = Uint8Array.from(binaryDer, c => c.charCodeAt(0));
  
  const key = await crypto.subtle.importKey(
    'spki',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['verify']
  );
  
  return await crypto.subtle.exportKey('jwk', key) as JsonWebKey;
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
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

/**
 * Get auth provider by ID
 */
export function getAuthProvider(id: string): AuthProvider {
  if (id === 'local') return new LocalAuthProvider();
  if (id === 'firebase') return new FirebaseAuthProvider();
  throw new Error(`Unknown auth provider: ${id}`);
}

/**
 * Try all configured providers
 */
export async function authenticate(req: Request, env: Env): Promise<AuthContext | null> {
  const config = getConfig(env);
  
  for (const providerId of config.authProviders) {
    const provider = getAuthProvider(providerId);
    const result = await provider.authenticate(req, env);
    if (result) return result;
  }
  
  return null;
}
