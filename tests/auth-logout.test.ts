/**
 * Logout must revoke the server session and clear the __Host- cookie.
 * Authenticated API responses must not be cacheable across logout.
 */

import { describe, expect, it } from 'vitest';
import { applySchema } from './schema';
import { call, cookieFrom, ensureOwnerSession } from './helpers';

describe('auth logout', () => {
  it('revokes the session so a refresh cannot stay signed in', async () => {
    await applySchema();
    const cookie = await ensureOwnerSession();

    const before = await call('/api/v1/budget', { headers: { cookie } });
    expect(before.status).toBe(200);
    expect(before.headers.get('cache-control') || '').toMatch(/no-store/i);

    const logout = await call('/auth/logout', {
      method: 'POST',
      headers: { cookie, 'x-ws-csrf': '1' },
    });
    expect(logout.status).toBe(200);
    const clear = logout.headers.get('set-cookie') || '';
    expect(clear).toContain('__Host-ws_session=');
    expect(clear).toMatch(/Max-Age=0/i);
    expect(clear).toMatch(/Secure/i);
    expect(clear).toMatch(/Path=\//i);
    expect(clear).not.toMatch(/Domain=/i);

    const after = await call('/api/v1/budget', { headers: { cookie } });
    expect(after.status).toBe(401);

    // Cleared cookie name alone must not authenticate
    const clearedOnly = cookieFrom(logout);
    const withCleared = await call('/api/v1/budget', {
      headers: { cookie: clearedOnly || '__Host-ws_session=' },
    });
    expect(withCleared.status).toBe(401);
  });
});
