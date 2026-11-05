/**
 * Scheduled jobs: hourly rollups, nightly CORE export, weekly Slack digest.
 */

import type { Env } from '../lib/types';
import { getConfig } from '../../wispstat.config';
import { listSites, runHourly } from './rollup';
import { runWeeklyDigest } from './digest';

async function putState(env: Env, job: string, scope: string, value: string): Promise<void> {
  await env.CORE.prepare(
    `INSERT INTO rollup_state (job, scope, value) VALUES (?, ?, ?)
     ON CONFLICT(job, scope) DO UPDATE SET value = excluded.value`
  ).bind(job, scope, value).run();
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
  if (cron === '0 15 * * 1') {
    await runWeeklyDigest(env, env.SLACK_WEBHOOK_URL);
  }
  console.log('Unhandled cron:', cron);
}

export { runHourly, listSites };
