/**
 * Scheduled jobs: hourly rollups, optional nightly CORE export, optional weekly Slack digest.
 */

import type { Env } from '../lib/types';
import { getConfig } from '../../wispstat.config';
import { shiftDate } from '../lib/dates';
import { getLocalDate } from '../lib/utils';
import { digestText, type DigestStats } from './digest';
import { listSites, runHourly } from './rollup';

async function putState(env: Env, job: string, scope: string, value: string): Promise<void> {
  await env.CORE.prepare(
    `INSERT INTO rollup_state (job, scope, value) VALUES (?, ?, ?)
     ON CONFLICT(job, scope) DO UPDATE SET value = excluded.value`
  ).bind(job, scope, value).run();
}

async function statsForRange(env: Env, sid: number, from: string, to: string): Promise<DigestStats> {
  const total = await env.CORE.prepare(`
    SELECT COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(pv), 0) AS pv
    FROM stats_daily
    WHERE sid = ? AND dim = 'total' AND day >= ? AND day <= ?
  `).bind(sid, from, to).first<{ visitors: number; pv: number }>();

  const source = await env.CORE.prepare(`
    SELECT channel, SUM(visitors) AS visitors
    FROM sources_daily
    WHERE sid = ? AND day >= ? AND day <= ?
    GROUP BY channel
    ORDER BY visitors DESC
    LIMIT 1
  `).bind(sid, from, to).first<{ channel: string }>();

  const page = await env.CORE.prepare(`
    SELECT k, SUM(pv) AS pv
    FROM stats_daily
    WHERE sid = ? AND dim = 'path' AND day >= ? AND day <= ?
    GROUP BY k
    ORDER BY pv DESC
    LIMIT 1
  `).bind(sid, from, to).first<{ k: string }>();

  const goals = await env.CORE.prepare(`
    SELECT COALESCE(SUM(conversions), 0) AS conversions, COALESCE(SUM(value_x100), 0) AS value_x100
    FROM goals_daily
    WHERE sid = ? AND day >= ? AND day <= ?
  `).bind(sid, from, to).first<{ conversions: number; value_x100: number }>();

  return {
    visitors: total?.visitors || 0,
    pv: total?.pv || 0,
    topSource: source?.channel || 'Direct',
    topPage: page?.k || '/',
    conversions: goals?.conversions || 0,
    revenue: (goals?.value_x100 || 0) / 100,
  };
}

export async function runWeekly(env: Env, nowSec = Math.floor(Date.now() / 1000)): Promise<{ sent: number; skipped: boolean }> {
  const config = getConfig(env);
  if (!config.slackWebhookUrl) {
    await putState(env, 'weekly', 'last', 'skipped:unconfigured');
    return { sent: 0, skipped: true };
  }

  const sites = (await listSites(env)).filter((site) => site.digest_enabled);
  let sent = 0;
  for (const site of sites) {
    const to = shiftDate(getLocalDate(nowSec, site.tz), -1);
    const from = shiftDate(to, -6);
    const prevTo = shiftDate(from, -1);
    const prevFrom = shiftDate(prevTo, -6);
    const current = await statsForRange(env, site.sid, from, to);
    const previous = await statsForRange(env, site.sid, prevFrom, prevTo);
    const body = digestText(site.name, current, previous);
    const response = await fetch(config.slackWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: body.text }),
    });
    if (!response.ok) {
      await putState(env, 'weekly', `error:${site.sid}`, `http_${response.status}`);
      continue;
    }
    sent += 1;
  }
  await putState(env, 'weekly', 'last', String(nowSec));
  return { sent, skipped: false };
}

export async function runNightly(env: Env, nowSec = Math.floor(Date.now() / 1000)): Promise<{ status: string }> {
  const config = getConfig(env);
  if (!config.cfApiToken || !config.cfAccountId || !env.D1_CORE_DATABASE_ID || !env.BACKUPS) {
    await putState(env, 'nightly', 'last', 'skipped:unconfigured');
    return { status: 'skipped' };
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/d1/database/${env.D1_CORE_DATABASE_ID}/export`;
  let signedUrl = '';
  let bookmark = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const start = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.cfApiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(bookmark ? { current_bookmark: bookmark } : { output_format: 'polling' }),
    });
    if (!start.ok) {
      await putState(env, 'nightly', 'last', `error:http_${start.status}`);
      return { status: 'error' };
    }
    const body = await start.json() as { result?: { signed_url?: string; current_bookmark?: string; at_bookmark?: string } };
    signedUrl = body.result?.signed_url || '';
    bookmark = body.result?.current_bookmark || body.result?.at_bookmark || bookmark;
    if (signedUrl) break;
  }
  if (!signedUrl) {
    await putState(env, 'nightly', 'last', 'error:no_signed_url');
    return { status: 'error' };
  }

  const dump = await fetch(signedUrl);
  if (!dump.ok) {
    await putState(env, 'nightly', 'last', 'error:download');
    return { status: 'error' };
  }
  const bytes = await dump.arrayBuffer();

  const day = new Date(nowSec * 1000).toISOString().slice(0, 10);
  await env.BACKUPS.put(`core/daily/${day}.sql`, bytes);
  if (day.endsWith('-01')) {
    await env.BACKUPS.put(`core/monthly/${day.slice(0, 7)}.sql`, bytes);
  }
  await pruneBackups(env);
  await putState(env, 'nightly', 'last', day);
  return { status: 'exported' };
}

async function pruneBackups(env: Env): Promise<void> {
  if (!env.BACKUPS) return;
  const config = getConfig(env);
  await prunePrefix(env, 'core/daily/', config.retention.r2DailyCount);
  await prunePrefix(env, 'core/monthly/', config.retention.r2MonthlyCount);
}

async function prunePrefix(env: Env, prefix: string, keep: number): Promise<void> {
  if (!env.BACKUPS) return;
  const listed = await env.BACKUPS.list({ prefix });
  const keys = listed.objects.map((object) => object.key).sort();
  const extra = keys.slice(0, Math.max(0, keys.length - keep));
  if (extra.length > 0) await env.BACKUPS.delete(extra);
}

export async function runScheduled(cron: string, env: Env): Promise<void> {
  const config = getConfig(env);
  if (cron === config.schedules.hourly) {
    await runHourly(env);
    return;
  }
  if (cron === config.schedules.nightly) {
    await runNightly(env);
    return;
  }
  if (cron === config.schedules.weekly) {
    await runWeekly(env);
    return;
  }
  console.log('Unhandled cron:', cron);
}

export { runHourly };
