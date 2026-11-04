/**
 * v1.2 visit tokens — AES-GCM wrap of same-day visitor hash. Stateless.
 */

import type { Env } from './types';

export interface VisitClaims {
  v: 1;
  sid: number;
  day: string;
  vh: string; // hex
  exp: number;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(tokenKey: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(tokenKey);
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function mintVisitToken(
  env: Env,
  claims: Omit<VisitClaims, 'v'>,
): Promise<string | null> {
  if (!env.TOKEN_KEY || env.TOKEN_KEY.length < 32) return null;
  const key = await importKey(env.TOKEN_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, ...claims }));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  return `${b64url(iv)}.${b64url(cipher)}`;
}

export async function openVisitToken(
  env: Env,
  token: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<VisitClaims | null> {
  if (!env.TOKEN_KEY || env.TOKEN_KEY.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  try {
    const key = await importKey(env.TOKEN_KEY);
    const ivPart = parts[0];
    const dataPart = parts[1];
    if (!ivPart || !dataPart) return null;
    const iv = fromB64url(ivPart);
    const data = fromB64url(dataPart);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const claims = JSON.parse(new TextDecoder().decode(plain)) as VisitClaims;
    if (claims.v !== 1 || !claims.sid || !claims.day || !claims.vh || !claims.exp) return null;
    if (claims.exp < nowSec) return null;
    if (!/^[0-9a-f]{64}$/i.test(claims.vh)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function visitTokenExpiry(nowSec: number, localDayEndSec: number): number {
  const twoHours = nowSec + 2 * 3600;
  const dayGrace = localDayEndSec + 30 * 60;
  return Math.min(twoHours, dayGrace);
}
