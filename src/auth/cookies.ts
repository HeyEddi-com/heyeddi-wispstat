/**
 * Session cookie helpers for __Host- prefixed local auth cookies.
 */

import { BRANDING } from '../../branding.config';

export function sessionCookieName(): string {
  return `${BRANDING.COOKIE_PREFIX}session`;
}

/** Attributes required for __Host- cookies (Secure + Path=/; no Domain). */
const HOST_ATTRS = 'HttpOnly; Secure; SameSite=Strict; Path=/';

export function setSessionCookie(token: string, maxAgeSec: number): string {
  return `${sessionCookieName()}=${token}; ${HOST_ATTRS}; Max-Age=${maxAgeSec}`;
}

/** Clear must mirror set attributes or browsers keep the cookie. */
export function clearSessionCookie(): string {
  return `${sessionCookieName()}=; ${HOST_ATTRS}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookie of cookieHeader.split(';')) {
    const [key, ...rest] = cookie.split('=');
    if (key && rest.length > 0) {
      cookies[key.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}
