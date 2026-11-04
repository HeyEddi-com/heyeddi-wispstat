/**
 * Isolate-local request damper. A Cloudflare Rate Limiting binding is per-location;
 * this Map is the stand-in until that binding is configured.
 */

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
