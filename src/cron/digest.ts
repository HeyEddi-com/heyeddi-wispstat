/**
 * Weekly Slack digest (opt-in per site). No visitor identifiers.
 */

import type { Env } from '../lib/types';

export function digestText(siteName: string, visitors: number, pageviews: number, top: string): string {
  return [
    `*Wispstat · ${siteName}*`,
    `Visitors ${visitors} · pageviews ${pageviews}`,
    top ? `Top: ${top}` : 'No source rows this week.',
  ].join('\n');
}

export async function runWeeklyDigest(env: Env, webhook: string | undefined): Promise<{ sent: number; skipped: string }> {
  if (!webhook) return { sent: 0, skipped: 'no_webhook' };
  const sites = await env.CORE.prepare(
    'SELECT sid, name FROM sites WHERE digest_enabled = 1'
  ).all<{ sid: number; name: string }>();
  let sent = 0;
  for (const site of sites.results) {
    const totals = await env.CORE.prepare(`
      SELECT COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(pv), 0) AS pv
      FROM stats_daily
      WHERE sid = ? AND dim = 'total' AND day >= date('now', '-7 day')
    `).bind(site.sid).first<{ visitors: number; pv: number }>();
    const source = await env.CORE.prepare(`
      SELECT channel, SUM(visitors) AS visitors
      FROM sources_daily
      WHERE sid = ? AND day >= date('now', '-7 day')
      GROUP BY channel
      ORDER BY visitors DESC
      LIMIT 1
    `).bind(site.sid).first<{ channel: string; visitors: number }>();
    const text = digestText(
      site.name,
      totals?.visitors || 0,
      totals?.pv || 0,
      source ? `${source.channel} (${source.visitors})` : ''
    );
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (response.ok) sent += 1;
  }
  return { sent, skipped: '' };
}
