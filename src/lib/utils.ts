/**
 * Utility functions
 */

import { CONSTANTS } from '../../wispstat.config';

/**
 * Generate a Crockford base32 site ID
 */
export function generateSiteId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10)); // 80 bits
  return CONSTANTS.SITE_ID_PREFIX + crockfordBase32(bytes);
}

/**
 * Crockford base32 encoding (no padding, lowercase)
 * Alphabet: 0-9 a-z excluding i, l, o, u
 */
const CROCKFORD_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function crockfordBase32(bytes: Uint8Array): string {
  let bits = 0n;
  for (const byte of bytes) {
    bits = (bits << 8n) | BigInt(byte);
  }
  
  let result = '';
  const base = BigInt(CROCKFORD_ALPHABET.length);
  while (bits > 0n || result.length < 16) {
    const idx = Number(bits % base);
    result = CROCKFORD_ALPHABET[idx] + result;
    bits /= base;
    if (result.length >= 16) break;
  }
  
  return result.slice(0, 16);
}

/**
 * Validate site_id format
 */
export function isValidSiteId(s: string): boolean {
  return /^s_[0-9a-hjkmnp-z]{16}$/.test(s);
}

/**
 * Generate a random token (base64url, no padding)
 */
export function generateToken(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlEncode(buf);
}

export function base64UrlEncode(buf: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buf));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function base64UrlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

/**
 * SHA-256 hash
 */
export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const buf = typeof data === 'string' 
    ? new TextEncoder().encode(data)
    : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(hash);
}

/**
 * Constant-time comparison
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  
  // Cloudflare Workers has timingSafeEqual, but not in standard types
  const cryptoSubtle = crypto.subtle as any;
  if (typeof cryptoSubtle.timingSafeEqual === 'function') {
    return cryptoSubtle.timingSafeEqual(a, b);
  }
  
  // Fallback
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/**
 * Parse JSON safely
 */
export function parseJsonSafe<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/**
 * Get local date in a timezone
 */
export function getLocalDate(ts: number, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(new Date(ts * 1000));
  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  
  return `${year}-${month}-${day}`;
}

/**
 * Get partition suffix from local date (YYYYMMDD)
 */
export function getPartitionSuffix(localDate: string): string {
  return localDate.replace(/-/g, '');
}

/**
 * Validate and normalize path
 */
export function normalizePath(path: string, maxLength: number): string {
  if (!path.startsWith('/')) path = '/' + path;
  path = path.split('?')[0]!.split('#')[0]!; // strip query and hash unless hash mode
  if (path.length > maxLength) path = path.slice(0, maxLength);
  return path;
}

/**
 * Validate and normalize UTM values
 */
const UTM_CHARSET = /^[a-z0-9_:.\-/ ]+$/;

export function normalizeUtm(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) return null;
  if (normalized.includes('@')) return null; // reject email-like
  if (!UTM_CHARSET.test(normalized)) return null;
  
  return normalized;
}

/**
 * Validate event name
 */
const EVENT_NAME_CHARSET = /^[a-z0-9_:.\-]+$/;

export function normalizeEventName(name: string | undefined, maxLength: number): string | null {
  if (!name) return null;
  
  const normalized = name.toLowerCase().trim();
  if (normalized.length === 0 || normalized.length > maxLength) return null;
  if (!EVENT_NAME_CHARSET.test(normalized)) return null;
  
  return normalized;
}

/**
 * Validate and normalize language (base tag only)
 */
export function normalizeLanguage(lang: string | undefined): string {
  if (!lang) return '';
  
  const base = lang.toLowerCase().split('-')[0]?.trim() || '';
  if (!/^[a-z]{2,3}$/.test(base)) return '';
  
  return base;
}

/**
 * Validate and normalize value (hundredths)
 */
export function normalizeValue(value: number | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 1e9) return null;
  
  return Math.round(value * 100);
}

/**
 * Coarse IP hash for rate limiting (memory only, not stored)
 */
export function coarseIpHash(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    // IPv4: keep first 24 bits
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  
  // IPv6: keep first 64 bits (4 groups)
  const v6parts = ip.split(':');
  return v6parts.slice(0, 4).join(':') + '::';
}

/**
 * Format error response
 */
export function errorResponse(code: string, message: string, status: number): Response {
  return Response.json(
    { error: { code, message } },
    { status }
  );
}
