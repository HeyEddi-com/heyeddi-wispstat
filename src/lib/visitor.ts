/**
 * Visitor hash computation
 */

import { CONSTANTS } from '../../wispstat.config';
import { sha256 } from './utils';

/**
 * Compute visitor hash from salt, site ID, IP, and User-Agent
 * vh = first 16 bytes of SHA-256(salt || 0x00 || sid || 0x00 || ip || 0x00 || ua)
 */
export async function computeVisitorHash(
  salt: Uint8Array,
  siteId: string,
  ip: string,
  userAgent: string
): Promise<Uint8Array> {
  // Truncate IPv6 to /64
  const normalizedIp = truncateIPv6(ip);
  
  // Build buffer: salt || 0x00 || siteId || 0x00 || ip || 0x00 || ua
  const encoder = new TextEncoder();
  const siteIdBytes = encoder.encode(siteId);
  const ipBytes = encoder.encode(normalizedIp);
  const uaBytes = encoder.encode(userAgent);
  
  const totalLen = salt.length + 1 + siteIdBytes.length + 1 + ipBytes.length + 1 + uaBytes.length;
  const buf = new Uint8Array(totalLen);
  
  let offset = 0;
  buf.set(salt, offset);
  offset += salt.length;
  buf[offset++] = 0x00;
  buf.set(siteIdBytes, offset);
  offset += siteIdBytes.length;
  buf[offset++] = 0x00;
  buf.set(ipBytes, offset);
  offset += ipBytes.length;
  buf[offset++] = 0x00;
  buf.set(uaBytes, offset);
  
  const hash = await sha256(buf);
  return hash.slice(0, CONSTANTS.VISITOR_HASH_BYTES);
}

/**
 * Truncate IPv6 address to /64 prefix
 */
function truncateIPv6(ip: string): string {
  if (!ip.includes(':')) {
    // IPv4, no truncation
    return ip;
  }
  
  // IPv6: keep first 4 groups (64 bits)
  const parts = ip.split(':');
  if (parts.length >= 4) {
    return parts.slice(0, 4).join(':') + '::';
  }
  
  return ip;
}

/**
 * Parse device, browser, and OS from User-Agent (coarse categories)
 */
export interface UAInfo {
  device: string;
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string): UAInfo {
  const lower = ua.toLowerCase();
  
  // Device
  let device = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    device = 'mobile';
  } else if (/tablet|ipad/i.test(ua)) {
    device = 'tablet';
  }
  
  // Browser (order matters)
  let browser = 'other';
  if (lower.includes('edg')) {
    browser = 'edge';
  } else if (lower.includes('chrome') || lower.includes('crios')) {
    browser = 'chrome';
  } else if (lower.includes('safari') && !lower.includes('chrome')) {
    browser = 'safari';
  } else if (lower.includes('firefox') || lower.includes('fxios')) {
    browser = 'firefox';
  } else if (lower.includes('opera') || lower.includes('opr')) {
    browser = 'opera';
  }
  
  // OS
  let os = 'other';
  if (/windows/i.test(ua)) {
    os = 'windows';
  } else if (/mac os x|macos/i.test(ua)) {
    os = 'macos';
  } else if (/linux/i.test(ua)) {
    os = 'linux';
  } else if (/android/i.test(ua)) {
    os = 'android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'ios';
  }
  
  return { device, browser, os };
}

/**
 * Check if request is from a bot
 */
export function isBot(userAgent: string): boolean {
  if (!userAgent || userAgent.trim() === '') return true;
  
  const lower = userAgent.toLowerCase();
  const botPatterns = [
    'bot', 'crawl', 'spider', 'headless', 'lighthouse',
    'curl', 'wget', 'python-requests', 'go-http',
    'slurp', 'bingbot', 'googlebot', 'baiduspider'
  ];
  
  return botPatterns.some(p => lower.includes(p));
}
