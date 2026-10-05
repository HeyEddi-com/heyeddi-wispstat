/**
 * Salt management (KV with TTL)
 */

import type { Env } from './types';
import { CONSTANTS } from '../../wispstat.config';
import { getLocalDate, getPartitionSuffix } from './utils';

/**
 * Get or create salt for a site's local date
 * Salts are cached in isolate memory with 60s TTL
 */
const saltCache = new Map<string, { salt: Uint8Array; expires: number }>();

export async function getSalt(
  env: Env,
  siteId: string,
  localDate: string
): Promise<Uint8Array> {
  const key = `${siteId}:${localDate}`;
  
  // Check isolate cache
  const cached = saltCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.salt;
  }
  
  // Check KV
  const kvKey = `salt:${siteId}:${getPartitionSuffix(localDate)}`;
  const stored = await env.SALTS.get(kvKey, 'arrayBuffer');
  
  if (stored) {
    const salt = new Uint8Array(stored);
    saltCache.set(key, { salt, expires: Date.now() + 60_000 });
    return salt;
  }
  
  // Create new salt
  const salt = crypto.getRandomValues(new Uint8Array(CONSTANTS.SALT_BYTES));
  
  // Compute TTL: expires ~6 hours after the local day ends
  const dayEnd = new Date(localDate + 'T23:59:59Z').getTime() / 1000;
  const ttl = Math.max(60, dayEnd + 6 * 3600 - Date.now() / 1000);
  
  await env.SALTS.put(kvKey, salt, { expirationTtl: Math.floor(ttl) });
  
  saltCache.set(key, { salt, expires: Date.now() + 60_000 });
  return salt;
}

/**
 * Pre-create salts for upcoming days (called by cron)
 */
export async function precreateSalts(
  env: Env,
  sites: Array<{ site_id: string; tz: string }>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  
  for (const site of sites) {
    const today = getLocalDate(now, site.tz);
    const tomorrow = getLocalDate(now + 86400, site.tz);
    
    await getSalt(env, site.site_id, today);
    await getSalt(env, site.site_id, tomorrow);
  }
}
