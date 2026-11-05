/**
 * Isolate-local request damper. A Cloudflare Rate Limiting binding is per-location;
 * this Map is the stand-in until that binding is configured.
 */

import type { Env } from './types';
import { coarseIpHash } from './utils';

const buckets = new Map<string, { start: number; count: number }>();

interface LimitConfig {
  perSiteLimit: number;
  perSitePeriod: number;
  perIpLimit: number;
  perIpPeriod: number;
}

export function allowRequest(key: string, limit: number, periodSec: number, nowSec: number): boolean {
  const current = buckets.get(key);
  if (!current || nowSec - current.start >= periodSec) {
    buckets.set(key, { start: nowSec, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export function withinLimits(siteId: string, ip: string, nowSec: number, limits: LimitConfig): boolean {
  const siteOk = allowRequest(`site:${siteId}`, limits.perSiteLimit, limits.perSitePeriod, nowSec);
  const ipOk = allowRequest(`ip:${siteId}:${coarseIpHash(ip || '0')}`, limits.perIpLimit, limits.perIpPeriod, nowSec);
  return siteOk && ipOk;
}

async function bump(kv: KVNamespace, key: string, limit: number, periodSec: number): Promise<boolean> {
  const current = Number(await kv.get(key) || '0') + 1;
  await kv.put(key, String(current), { expirationTtl: Math.max(60, periodSec) });
  return current <= limit;
}

/** Shared counter in KV so the limit holds across isolates. Falls back to the in-memory damper. */
export async function enforceLimits(env: Env, siteId: string, ip: string, nowSec: number, limits: LimitConfig): Promise<boolean> {
  try {
    const siteWindow = Math.floor(nowSec / limits.perSitePeriod);
    const ipWindow = Math.floor(nowSec / limits.perIpPeriod);
    const siteOk = await bump(env.SALTS, `rl:s:${siteId}:${siteWindow}`, limits.perSiteLimit, limits.perSitePeriod);
    const ipOk = await bump(env.SALTS, `rl:i:${siteId}:${coarseIpHash(ip || '0')}:${ipWindow}`, limits.perIpLimit, limits.perIpPeriod);
    return siteOk && ipOk;
  } catch {
    return withinLimits(siteId, ip, nowSec, limits);
  }
}
